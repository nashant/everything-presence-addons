/**
 * HaHelperService — creates, updates, and deletes HA template helpers
 * via the Home Assistant config flow REST API.
 *
 * Used for the room-level "occupied" binary sensor, which is created as
 * a native HA template helper (not MQTT discovery) and attached to the
 * MQTT room virtual device via device_id.
 *
 * API flow (create):
 *   1. POST /api/config/config_entries/flow  {handler:"template"} → flow_id + menu
 *   2. POST /api/config/config_entries/flow/{flow_id}  {next_step_id:"binary_sensor"} → form
 *   3. POST /api/config/config_entries/flow/{flow_id}  {name, state, device_class, device_id} → create_entry
 *
 * API flow (update):
 *   1. POST /api/config/config_entries/options/flow  {handler:entry_id} → form
 *   2. POST /api/config/config_entries/options/flow/{flow_id}  {state, device_id} → update
 *
 * API flow (delete):
 *   1. DELETE /api/config/config_entries/entry/{entry_id}
 */

import { logger } from '../logger.js';

const log = logger.child({ module: 'ha-helper-service' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HaAuthConfig {
  baseUrl: string; // ends with /api
  token: string;
}

export interface CreateTemplateBinarySensorParams {
  name: string;
  /** Jinja2 template that evaluates to true/false */
  stateTemplate: string;
  deviceClass: 'occupancy';
  /** HA device registry ID to attach the entity to */
  deviceId: string;
}

export interface UpdateTemplateBinarySensorParams {
  configEntryId: string;
  /** Jinja2 template that evaluates to true/false */
  stateTemplate: string;
  /** HA device registry ID to attach the entity to */
  deviceId: string;
}

export interface CreateHelperResult {
  configEntryId: string;
  entityId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HaHelperService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: HaAuthConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  // ── Create ──

  /**
   * Create a template binary sensor helper via the HA config flow API
   * and attach it to the specified device.
   *
   * Returns the config entry ID (for future updates/deletion) and the
   * entity_id HA assigned.
   */
  async createTemplateBinarySensor(
    params: CreateTemplateBinarySensorParams,
  ): Promise<CreateHelperResult> {
    const { name, stateTemplate, deviceClass, deviceId } = params;

    log.info({ name, deviceClass, deviceId }, 'Creating template binary sensor helper');

    // Step 1: Init config flow for template domain
    const initResp = await this.post('/config/config_entries/flow', {
      handler: 'template',
      show_advanced_options: false,
    });

    if (initResp.type !== 'menu' || !initResp.flow_id) {
      throw new Error(
        `Unexpected config flow init response: type=${initResp.type}, expected menu`,
      );
    }

    const flowId: string = initResp.flow_id;

    // Step 2: Select binary_sensor from the menu
    const menuResp = await this.post(`/config/config_entries/flow/${flowId}`, {
      next_step_id: 'binary_sensor',
    });

    if (menuResp.type !== 'form') {
      throw new Error(
        `Unexpected menu selection response: type=${menuResp.type}, expected form`,
      );
    }

    // Step 3: Submit the binary_sensor form
    const createResp = await this.post(`/config/config_entries/flow/${flowId}`, {
      name,
      state: stateTemplate,
      device_class: deviceClass,
      device_id: deviceId,
    });

    if (createResp.type !== 'create_entry') {
      throw new Error(
        `Failed to create template helper: type=${createResp.type}, errors=${JSON.stringify(createResp.errors)}`,
      );
    }

    const configEntryId: string = createResp.result.entry_id;
    // HA derives entity_id from the name; the unique_id equals the config entry ID
    const entityId = `binary_sensor.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    log.info(
      { configEntryId, entityId, name, deviceId },
      'Template binary sensor helper created',
    );

    return { configEntryId, entityId };
  }

  // ── Update ──

  /**
   * Update an existing template binary sensor helper's state template
   * and/or device attachment via the options flow API.
   */
  async updateTemplateBinarySensor(
    params: UpdateTemplateBinarySensorParams,
  ): Promise<void> {
    const { configEntryId, stateTemplate, deviceId } = params;

    log.info({ configEntryId, deviceId }, 'Updating template binary sensor helper');

    // Step 1: Init options flow
    const initResp = await this.post('/config/config_entries/options/flow', {
      handler: configEntryId,
      show_advanced_options: false,
    });

    if (!initResp.flow_id) {
      throw new Error(
        `Failed to start options flow for entry ${configEntryId}: ${JSON.stringify(initResp)}`,
      );
    }

    const flowId: string = initResp.flow_id;

    // Step 2: Submit updated values
    const updateResp = await this.post(
      `/config/config_entries/options/flow/${flowId}`,
      {
        state: stateTemplate,
        device_id: deviceId,
      },
    );

    if (updateResp.type === 'create_entry') {
      log.info({ configEntryId }, 'Template binary sensor helper updated');
    } else {
      // Options flow returns different response types depending on HA version
      log.info(
        { configEntryId, responseType: updateResp.type },
        'Template binary sensor helper options flow completed',
      );
    }
  }

  // ── Delete ──

  /**
   * Delete a template helper by its config entry ID.
   * Idempotent — returns true if deleted, false if not found.
   */
  async deleteTemplateBinarySensor(configEntryId: string): Promise<boolean> {
    log.info({ configEntryId }, 'Deleting template binary sensor helper');

    try {
      const resp = await this.delete(`/config/config_entries/entry/${configEntryId}`);
      log.info({ configEntryId, requireRestart: resp?.require_restart }, 'Template helper deleted');
      return true;
    } catch (err: unknown) {
      // 404 or similar — entry already gone
      if (err instanceof HaApiError && err.status === 404) {
        log.warn({ configEntryId }, 'Template helper not found — already deleted');
        return false;
      }
      throw err;
    }
  }

  // ── Device lookup ──

  /**
   * Find the HA device registry ID for an MQTT room device by its
   * MQTT identifier. Returns null if not found.
   *
   * The MQTT room device identifier follows the pattern:
   *   ["mqtt", "ep_room_{sanitizedRoomId}"]
   */
  async findRoomDeviceId(
    sanitizedRoomId: string,
    readTransport: { listDevices(): Promise<Array<{ id: string; identifiers: Array<[string, string]> }>> },
  ): Promise<string | null> {
    const expectedIdentifier = `ep_room_${sanitizedRoomId}`;
    const devices = await readTransport.listDevices();

    for (const device of devices) {
      for (const [domain, identifier] of device.identifiers) {
        if (domain === 'mqtt' && identifier === expectedIdentifier) {
          return device.id;
        }
      }
    }

    log.warn(
      { sanitizedRoomId, expectedIdentifier },
      'Room device not found in HA device registry',
    );
    return null;
  }

  // ── HTTP helpers ──

  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HaApiError(
        `HA API POST ${path} failed: ${resp.status} ${resp.statusText}`,
        resp.status,
        text,
      );
    }

    return resp.json();
  }

  private async delete(path: string): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HaApiError(
        `HA API DELETE ${path} failed: ${resp.status} ${resp.statusText}`,
        resp.status,
        text,
      );
    }

    return resp.json();
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class HaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'HaApiError';
  }
}
