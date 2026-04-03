import http from 'http';
import path from 'path';
import { loadConfig, redactedHaConfig } from './config';
import { logger } from './logger';
import { createServer, TransportStatus } from './server';
import { HaWriteClient } from './ha/writeClient';
import { HaHelperService } from './ha/haHelperService';
import { MqttClient } from './ha/mqttClient';
import { createReadTransport, TransportFactoryResult } from './ha/transportFactory';
import { DeviceProfileLoader } from './domain/deviceProfiles';
import { RoomOccupancyManager } from './domain/roomOccupancyManager';
import { createLiveWebSocketServer } from './routes/liveWs';
import { createLanFirmwareServer } from './lanFirmwareServer';

const start = async () => {
  try {
    const config = loadConfig();

    logger.info('Initializing Home Assistant clients...');

    // 1. Initialize Write Client (always REST, always available)
    logger.info('Initializing REST write client...');
    const writeClient = new HaWriteClient(config.ha);
    logger.info('REST write client ready');

    // 2. Initialize Read Transport (WS preferred, REST fallback)
    logger.info('Initializing read transport (WebSocket preferred)...');
    let transportResult: TransportFactoryResult;
    try {
      transportResult = await createReadTransport(
        {
          baseUrl: config.ha.baseUrl,
          token: config.ha.token,
          mode: config.ha.mode,
        },
        {
          wsConnectionTimeout: 5000,
          preferWebSocket: true,
          restPollingInterval: 1000,
        }
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize read transport - no HA connectivity');
      throw err;
    }

    const { transport: readTransport, activeTransport, wsAvailable, restAvailable } = transportResult;

    // Log transport status
    if (activeTransport === 'websocket') {
      logger.info('Read transport: WebSocket (real-time updates)');
    } else {
      logger.info({ pollingInterval: 1000 }, 'Read transport: REST (polling mode)');
    }
    logger.info(
      { readTransport: activeTransport, writeTransport: 'rest', wsAvailable, restAvailable },
      'Transport status'
    );

    // 3. Initialize profile loader
    const profileLoader = new DeviceProfileLoader(
      path.resolve(__dirname, '../config/device-profiles'),
      path.resolve(process.cwd(), 'config/device-profiles'),
    );

    // 4. Initialize MQTT client (optional — needed for room device lifecycle)
    let mqttClient: MqttClient | undefined;
    if (config.mqtt) {
      try {
        mqttClient = new MqttClient(config.mqtt);
        await mqttClient.connect();
        logger.info({ brokerUrl: config.mqtt.brokerUrl }, 'MQTT client connected for room device lifecycle');
      } catch (err) {
        logger.error({ err, brokerUrl: config.mqtt.brokerUrl }, 'Failed to connect MQTT client — room device lifecycle will be unavailable');
        mqttClient = undefined;
      }
    } else {
      logger.info('No MQTT config — room device lifecycle will be unavailable');
    }

    // 4b. Initialize HA Helper Service (for creating template helpers via HA API)
    const haHelperService = new HaHelperService({
      baseUrl: config.ha.baseUrl,
      token: config.ha.token,
    });
    logger.info('HA helper service ready');

    // Build transport status for API exposure
    const transportStatus: TransportStatus = {
      readTransport: activeTransport,
      writeTransport: 'rest',
      wsAvailable,
      restAvailable,
    };

    // 5. Create Express app with dependencies
    const app = createServer(config, {
      readTransport,
      writeClient,
      profileLoader,
      transportStatus,
      mqttClient,
      haHelperService,
    });

    // 6. Create HTTP server
    const httpServer = http.createServer(app);

    // 7. Attach WebSocket server for live tracking (frontend connections)
    createLiveWebSocketServer(httpServer, readTransport, profileLoader);

    // 8. Start LAN Firmware Server (separate port for device firmware downloads)
    createLanFirmwareServer(config.firmware.lanPort);

    // 9. Start main server listening
    httpServer.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          firmwareLanPort: config.firmware.lanPort,
          ha: redactedHaConfig(config.ha),
          readTransport: activeTransport,
          writeTransport: 'rest',
        },
        'Zone Configurator backend started',
      );

      // 10. Initialize room occupancy manager (async, non-blocking)
      if (mqttClient) {
        const occupancyManager = new RoomOccupancyManager(haHelperService, readTransport, mqttClient);
        occupancyManager.initialize().catch((err) => {
          logger.error({ err }, 'Room occupancy manager initialization failed');
        });
      }
    });
  } catch (error) {
    logger.error({ error, message: (error as Error).message, stack: (error as Error).stack }, 'Failed to start backend');
    process.exit(1);
  }
};

start();
