/**
 * PhenotypeStore.js - Phase 4.4 Lane Phenotype Persistence
 *
 * COPIED FROM: Archivist-Agent/src/attestation/PhenotypeStore.js
 * VERSION: 1.0
 * LAST_SYNC: 2026-04-19
 *
 * Stores "last known synchronized phenotype" for each lane.
 * Enables drift detection and rollback during quarantine loop.
 * DO NOT MODIFY - changes must be synced from Archivist.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TRUST_STORE_PATH, TRUST_STORE_VERSION } = require('./constants');
const { stableStringify } = require('./stableStringify');

class PhenotypeStore {
	constructor(options = {}) {
    const testMode =
      options.testMode === true ||
      process.env.SWARM_TEST_MODE === '1' ||
      process.env.NODE_ENV === 'test';
    if (options.trustStorePath && !testMode) {
      throw new Error(
        'trustStorePath override is forbidden in production - use the broadcast store via TRUST_STORE_PATH'
      );
    }
		this.trustStorePath = options.trustStorePath || TRUST_STORE_PATH;
    this.testMode = testMode;
		this.phenotypes = null;
		this._load();
	}

	_load() {
		if (!fs.existsSync(this.trustStorePath)) {
      if (this.testMode) {
        this.phenotypes = {};
        return;
      }
      throw new Error(`Trust store missing at path: ${this.trustStorePath}`);
		}
		try {
			const raw = fs.readFileSync(this.trustStorePath, 'utf8');
			const data = JSON.parse(raw);
			this.phenotypes = data.phenotypes || {};
		} catch (e) {
      if (this.testMode) {
        this.phenotypes = {};
        return;
      }
      throw new Error(`Trust store load failed at ${this.trustStorePath}: ${e.message}`);
		}
	}

	_save() {
		if (!fs.existsSync(this.trustStorePath)) {
			return;
		}
		try {
			const raw = fs.readFileSync(this.trustStorePath, 'utf8');
			const data = JSON.parse(raw);
			data.phenotypes = this.phenotypes;
			fs.writeFileSync(this.trustStorePath, JSON.stringify(data, null, 2));
		} catch (e) {
			console.error('[PhenotypeStore] Failed to save:', e.message);
		}
	}

  computeHash(state) {
    return 'sha256:' + crypto.createHash('sha256')
      .update(stableStringify(state))
      .digest('hex').slice(0, 16);
  }

	getLastSync(laneId) {
		return this.phenotypes[laneId] || null;
	}

	setLastSync(laneId, state) {
		const hash = this.computeHash(state);
		this.phenotypes[laneId] = {
			hash,
			last_sync: new Date().toISOString(),
			state_summary: typeof state === 'object' ? Object.keys(state).join(',') : String(state).slice(0, 50)
		};
		this._save();
		return hash;
	}

	compareWithLast(laneId, currentState) {
		const last = this.getLastSync(laneId);
		if (!last) {
			return { match: false, reason: 'NO_PREVIOUS_PHENOTYPE' };
		}
		const currentHash = this.computeHash(currentState);
		return {
			match: last.hash === currentHash,
			last_hash: last.hash,
			current_hash: currentHash,
			last_sync: last.last_sync
		};
	}

	async syncFromAuthority(laneId, authorityClient) {
		const authoritative = await authorityClient.fetchPhenotype(laneId);
		if (authoritative) {
			this.setLastSync(laneId, authoritative);
			return { success: true, hash: this.phenotypes[laneId].hash };
		}
		return { success: false, reason: 'AUTHORITY_UNREACHABLE' };
	}

	getAllPhenotypes() {
		return { ...this.phenotypes };
	}

	clearPhenotype(laneId) {
		delete this.phenotypes[laneId];
		this._save();
	}
}

module.exports = { PhenotypeStore };
