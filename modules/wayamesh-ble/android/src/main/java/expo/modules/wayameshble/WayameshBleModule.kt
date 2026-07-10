package expo.modules.wayameshble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.UUID

// The BLE *peripheral* half of the Wayamesh mesh — the piece React Native BLE
// libraries don't provide. It advertises the Wayamesh service and runs a GATT
// server that reassembles chunked payment frames written by a nearby central
// (see src/mesh/ble.ts relayTransaction — frames are base64(JSON{h,i,n,d})).
// A completed payload is emitted to JS, which validates and queues it.

private val SERVICE_UUID: UUID = UUID.fromString("c0de0001-cafe-beef-dead-000000000001")
private val TX_CHAR_UUID: UUID = UUID.fromString("c0de0002-cafe-beef-dead-000000000002")

class WayameshBleModule : Module() {
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var gattServer: BluetoothGattServer? = null

  // Reassembly buffers keyed by "<deviceAddress>|<txHash>".
  private val buffers = HashMap<String, Array<String?>>()

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context lost" }

  private val bluetoothManager: BluetoothManager?
    get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager

  override fun definition() = ModuleDefinition {
    Name("WayameshBle")

    Events("onEnvelopeReceived", "onAdvertisingChanged")

    Function("isSupported") {
      val adapter = bluetoothManager?.adapter
      adapter != null && adapter.isEnabled && adapter.bluetoothLeAdvertiser != null
    }

    AsyncFunction("startAdvertising") { promise: Promise ->
      try {
        startPeripheral(promise)
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", "Bluetooth advertise/connect permission not granted", e)
      } catch (e: Exception) {
        promise.reject("E_BLE", e.message ?: "Failed to start BLE peripheral", e)
      }
    }

    AsyncFunction("stopAdvertising") { promise: Promise ->
      stopPeripheral()
      promise.resolve(true)
    }

    OnDestroy {
      stopPeripheral()
    }
  }

  @SuppressLint("MissingPermission") // JS requests runtime permissions first
  private fun startPeripheral(promise: Promise) {
    val adapter = bluetoothManager?.adapter
      ?: return promise.reject("E_UNSUPPORTED", "Bluetooth not available", null)
    if (!adapter.isEnabled) {
      return promise.reject("E_OFF", "Bluetooth is turned off", null)
    }
    val leAdvertiser = adapter.bluetoothLeAdvertiser
      ?: return promise.reject("E_UNSUPPORTED", "This device cannot advertise over BLE", null)

    if (advertiseCallback != null) {
      return promise.resolve(true) // already advertising
    }

    // GATT server with a single writable characteristic for payment frames.
    val server = bluetoothManager?.openGattServer(context, serverCallback)
      ?: return promise.reject("E_BLE", "Could not open GATT server", null)
    val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    val characteristic = BluetoothGattCharacteristic(
      TX_CHAR_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE,
      BluetoothGattCharacteristic.PERMISSION_WRITE,
    )
    service.addCharacteristic(characteristic)
    server.addService(service)
    gattServer = server

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setConnectable(true)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .build()
    // Service UUID only — device names overflow the 31-byte advertisement.
    val data = AdvertiseData.Builder()
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .setIncludeDeviceName(false)
      .build()

    val callback = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
        sendEvent("onAdvertisingChanged", mapOf("advertising" to true))
        promise.resolve(true)
      }
      override fun onStartFailure(errorCode: Int) {
        advertiseCallback = null
        sendEvent("onAdvertisingChanged", mapOf("advertising" to false, "error" to errorCode))
        promise.reject("E_ADVERTISE", "Advertising failed with code $errorCode", null)
      }
    }
    advertiseCallback = callback
    leAdvertiser.startAdvertising(settings, data, callback)
    advertiser = leAdvertiser
  }

  @SuppressLint("MissingPermission")
  private fun stopPeripheral() {
    try { advertiseCallback?.let { advertiser?.stopAdvertising(it) } } catch (_: Exception) {}
    try { gattServer?.close() } catch (_: Exception) {}
    advertiser = null
    advertiseCallback = null
    gattServer = null
    buffers.clear()
    sendEvent("onAdvertisingChanged", mapOf("advertising" to false))
  }

  private val serverCallback = object : BluetoothGattServerCallback() {
    @SuppressLint("MissingPermission")
    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray,
    ) {
      var ok = false
      if (characteristic.uuid == TX_CHAR_UUID) {
        ok = try {
          handleFrame(device.address, value)
          true
        } catch (_: Exception) {
          false
        }
      }
      if (responseNeeded) {
        gattServer?.sendResponse(
          device, requestId,
          if (ok) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE,
          offset, null,
        )
      }
    }
  }

  /** Frame protocol: base64(JSON {h: txHash, i: index, n: total, d: base64 slice}). */
  private fun handleFrame(deviceAddress: String, value: ByteArray) {
    val frame = JSONObject(String(Base64.decode(value, Base64.DEFAULT), Charsets.UTF_8))
    val hash = frame.getString("h")
    val index = frame.getInt("i")
    val total = frame.getInt("n")
    val chunk = frame.getString("d")
    if (total <= 0 || total > 64 || index < 0 || index >= total) return

    val key = "$deviceAddress|$hash"
    val buffer = buffers.getOrPut(key) { arrayOfNulls(total) }
    if (buffer.size != total) { buffers.remove(key); return }
    buffer[index] = chunk

    if (buffer.all { it != null }) {
      buffers.remove(key)
      val rawSigned = String(
        Base64.decode(buffer.joinToString(""), Base64.DEFAULT),
        Charsets.UTF_8,
      )
      sendEvent("onEnvelopeReceived", mapOf(
        "rawSigned" to rawSigned,
        "txHash" to hash,
        "peer" to deviceAddress,
      ))
    }
  }
}
