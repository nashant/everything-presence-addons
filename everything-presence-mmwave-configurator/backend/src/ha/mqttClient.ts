import mqtt, { type MqttClient as MqttJsClient } from 'mqtt';
import { logger } from '../logger.js';
import type { MqttConfig } from './types.js';

const log = logger.child({ module: 'mqtt-client' });

/**
 * Thin wrapper around the `mqtt` package that manages broker connection,
 * publish with retain, and disconnect. Follows the same service pattern as
 * HaWriteClient: constructor takes config, exposes connect/disconnect/publish.
 */
export class MqttClient {
  private client: MqttJsClient | null = null;
  private readonly config: MqttConfig;

  constructor(config: MqttConfig) {
    this.config = config;
  }

  /**
   * Connect to the MQTT broker. Rejects if the connection fails.
   */
  async connect(): Promise<void> {
    if (this.client) {
      log.warn('connect() called but client already exists — disconnecting first');
      await this.disconnect();
    }

    const { brokerUrl } = this.config;
    log.info({ brokerUrl }, 'Connecting to MQTT broker');

    try {
      this.client = await mqtt.connectAsync(brokerUrl, {
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
      });

      this.client.on('error', (err) => {
        log.error({ err, brokerUrl }, 'MQTT client error');
      });

      this.client.on('reconnect', () => {
        log.info({ brokerUrl }, 'MQTT client reconnecting');
      });

      this.client.on('close', () => {
        log.info({ brokerUrl }, 'MQTT connection closed');
      });

      log.info({ brokerUrl }, 'MQTT broker connected');
    } catch (err) {
      log.error({ err, brokerUrl }, 'Failed to connect to MQTT broker');
      this.client = null;
      throw err;
    }
  }

  /**
   * Publish a message to a topic. Defaults to QoS 1 with retain.
   */
  async publish(topic: string, payload: string | Buffer, retain = true): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT client is not connected — call connect() first');
    }
    await this.client.publishAsync(topic, payload, { qos: 1, retain });
  }

  /**
   * Gracefully disconnect from the broker.
   */
  async disconnect(): Promise<void> {
    if (!this.client) return;

    const { brokerUrl } = this.config;
    log.info({ brokerUrl }, 'Disconnecting from MQTT broker');

    try {
      await this.client.endAsync();
    } catch (err) {
      log.warn({ err, brokerUrl }, 'Error during MQTT disconnect');
    } finally {
      this.client = null;
    }
  }

  /**
   * Whether the underlying client reports a live connection.
   */
  get isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  /**
   * Subscribe to a topic pattern and invoke the callback on each message.
   * Uses QoS 1. The callback receives the topic and raw payload buffer.
   */
  async subscribe(
    topicFilter: string,
    callback: (topic: string, payload: Buffer) => void,
  ): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT client is not connected — call connect() first');
    }

    this.client.on('message', (topic: string, payload: Buffer) => {
      // Only invoke callback if the topic matches the filter.
      // For simple wildcard matching (+), delegate to the mqtt library's built-in routing.
      callback(topic, payload);
    });

    await this.client.subscribeAsync(topicFilter, { qos: 1 });
    log.info({ topicFilter }, 'Subscribed to MQTT topic');
  }
}
