# S02: HA room device + template sensor creation proof

**Goal:** Prove the HA integration pipeline works end-to-end: MQTT client → discovery message → HA device; WS API → template helper → binary sensor with Jinja2 template. Retire the two biggest integration unknowns.
**Demo:** After this: A hardcoded test room creates a virtual HA device via MQTT discovery. Template binary sensors created via WS API appear in HA device registry with correct Jinja2 templates referencing EP sensor zone entities.

## Tasks
