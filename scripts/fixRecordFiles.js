/**
 * Backfill & Diagnostic script: fixRecordFiles.js
 * 
 * Inspects existing MedicalRecord documents in MongoDB:
 * - Backfills missing file metadata: resourceType, format, mimeType, bytes, originalName.
 * - Probes Cloudinary assets to verify upstream availability.
 * - Identifies and reports broken/unreachable assets.
 * 
 * Usage:
 *   node scripts/fixRecordFiles.js [--dry-run]
 */

const path = require('path');
module.paths.push(path.join(__dirname, '../backend/node_modules'));
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const MedicalRecord = require('../backend/src/models/MedicalRecord');
const { isCloudinaryConfigured, cloudinary } = require('../backend/src/config/cloudinary');

const isDryRun = process.argv.includes('--dry-run');

function detectMime(buffer) {
  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { mime: 'application/pdf', format: 'pdf', resourceType: 'auto' };
    }
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { mime: 'image/png', format: 'png', resourceType: 'image' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mime: 'image/jpeg', format: 'jpg', resourceType: 'image' };
    }
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { mime: 'image/webp', format: 'webp', resourceType: 'image' };
    }
  }
  return null;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/drnutrident';
  console.log('=== DrNutrident Medical Record File Fixer ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no DB writes)' : 'LIVE EXECUTION'}`);
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);

  try {
    const records = await MedicalRecord.find({});
    console.log(`Total medical records found: ${records.length}\n`);

    const stats = {
      total: records.length,
      upToDate: 0,
      updated: 0,
      unreachable: [],
    };

    for (const record of records) {
      const file = record.file || {};
      const fileUrl = file.url;

      if (!fileUrl) {
        stats.unreachable.push({
          id: record._id.toString(),
          title: record.title,
          reason: 'Missing file.url in database document',
        });
        continue;
      }

      let targetUrl = fileUrl;
      if (isCloudinaryConfigured() && file.publicId) {
        try {
          const signed = cloudinary.url(file.publicId, {
            sign_url: true,
            secure: true,
            resource_type: file.resourceType || 'image',
            format: file.format || undefined,
          });
          if (signed) targetUrl = signed;
        } catch {
          targetUrl = fileUrl;
        }
      }

      let fetchOk = false;
      let buffer = null;

      try {
        let res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok && targetUrl !== fileUrl) {
          res = await fetch(fileUrl, { signal: AbortSignal.timeout(10000) });
        }

        if (res.ok) {
          const ab = await res.arrayBuffer();
          buffer = Buffer.from(ab);
          fetchOk = true;
        } else {
          stats.unreachable.push({
            id: record._id.toString(),
            title: record.title,
            url: fileUrl,
            status: res.status,
            reason: `HTTP ${res.status} from storage provider`,
          });
        }
      } catch (fetchErr) {
        stats.unreachable.push({
          id: record._id.toString(),
          title: record.title,
          url: fileUrl,
          reason: fetchErr.message || 'Network / connection timeout',
        });
      }

      if (!fetchOk || !buffer) continue;

      const detected = detectMime(buffer);
      const isPdf = detected?.mime === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf') || file.format === 'pdf';
      const resolvedMime = detected?.mime || (isPdf ? 'application/pdf' : file.mimeType || 'application/octet-stream');
      const resolvedFormat = detected?.format || (isPdf ? 'pdf' : file.format || '');
      const resolvedResourceType = detected?.resourceType || (isPdf ? 'auto' : file.resourceType || 'image');
      const resolvedBytes = buffer.length;
      const resolvedOriginalName = file.originalName || `${(record.title || 'record').replace(/[^a-zA-Z0-9_-]/g, '_')}.${resolvedFormat || 'pdf'}`;

      const needsUpdate =
        !file.mimeType ||
        !file.format ||
        !file.bytes ||
        !file.originalName ||
        file.mimeType !== resolvedMime ||
        file.format !== resolvedFormat ||
        file.bytes !== resolvedBytes;

      if (!needsUpdate) {
        stats.upToDate++;
      } else {
        console.log(`[Record ${record._id}] Updating metadata -> format: ${resolvedFormat}, mime: ${resolvedMime}, bytes: ${resolvedBytes}`);
        if (!isDryRun) {
          record.file.mimeType = resolvedMime;
          record.file.format = resolvedFormat;
          record.file.resourceType = resolvedResourceType;
          record.file.bytes = resolvedBytes;
          record.file.originalName = resolvedOriginalName;
          await record.save();
        }
        stats.updated++;
      }
    }

    console.log('\n--- Summary Report ---');
    console.log(`Total Records:    ${stats.total}`);
    console.log(`Already Complete: ${stats.upToDate}`);
    console.log(`Updated Records:  ${stats.updated} ${isDryRun ? '(Dry Run - none written)' : ''}`);
    console.log(`Unreachable / Failed: ${stats.unreachable.length}`);

    if (stats.unreachable.length > 0) {
      console.log('\nUnreachable Records:');
      stats.unreachable.forEach((u) => {
        console.log(`  - [${u.id}] "${u.title}": ${u.reason} (${u.url || 'no url'})`);
      });
    }

    console.log('\nFixer run finished.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal error during fixRecordFiles execution:', err);
    process.exit(1);
  });
}

module.exports = { run };

