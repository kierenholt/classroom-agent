#!/usr/bin/env bash
# ==============================================================================
# Classroom Agent — One-Time Production Infrastructure Provisioning Script
# Project: classroom-agent-511917
# Region:  europe-west2 (London)
# ==============================================================================
set -euo pipefail

PROJECT_ID="classroom-agent-511917"
REGION="europe-west2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=================================================================="
echo " Provisioning Classroom Agent Production Infrastructure"
echo " Project ID : ${PROJECT_ID}"
echo " Region     : ${REGION}"
echo "=================================================================="

cd "${ROOT_DIR}"

# 1. Set active GCP project & default region to europe-west2
echo "[1/7] Configuring GCP project (${PROJECT_ID}) and region (${REGION})..."
gcloud config set project "${PROJECT_ID}"
gcloud config set functions/region "${REGION}"
gcloud config set run/region "${REGION}"

# 2. Enable all required Google Cloud, Firebase & Google Workspace APIs
echo "[2/7] Enabling required GCP, Firebase, and Google Workspace APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  firestore.googleapis.com \
  firebasestorage.googleapis.com \
  storage.googleapis.com \
  firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com \
  secretmanager.googleapis.com \
  classroom.googleapis.com \
  drive.googleapis.com \
  docs.googleapis.com \
  --project="${PROJECT_ID}"

# 3. Verify / Provision Cloud Firestore Native Database in europe-west2
echo "[3/7] Verifying Cloud Firestore '(default)' database in ${REGION}..."
if gcloud firestore databases describe --database="(default)" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  DB_LOC="$(gcloud firestore databases describe --database="(default)" --project="${PROJECT_ID}" --format='value(locationId)')"
  echo "  -> Firestore '(default)' database already exists in region: ${DB_LOC}"
  if [[ "${DB_LOC}" != "${REGION}" ]]; then
    echo "  -> ERROR: Firestore database location is '${DB_LOC}', expected '${REGION}'!"
    exit 1
  fi
else
  echo "  -> Creating Firestore '(default)' database in ${REGION}..."
  gcloud firestore databases create \
    --database="(default)" \
    --location="${REGION}" \
    --type="firestore-native" \
    --project="${PROJECT_ID}"
fi

# 4. Sync production environment variables into functions/.env.classroom-agent-511917
echo "[4/7] Syncing production backend environment variables..."
node "${ROOT_DIR}/scripts/sync_prod_env.js"

# 5. Build Cloud Functions and Frontend Production Bundle
echo "[5/7] Building Cloud Functions and Frontend SPA..."
npm --prefix "${ROOT_DIR}/functions" run build
npm run build

# 6. Deploy Firestore rules/indexes, Storage rules, Cloud Functions (europe-west2), and Hosting
echo "[6/7] Deploying Firebase infrastructure (Firestore, Storage, Functions in ${REGION}, Hosting)..."
npx firebase-tools deploy --only firestore,storage,functions,hosting --project "${PROJECT_ID}"

# 7. Ensure public HTTP invoker access on the 2nd Gen Cloud Function (Cloud Run service in europe-west2)
echo "[7/7] Ensuring public HTTP invoker IAM policy on 'api' service in ${REGION}..."
gcloud run services add-iam-policy-binding api \
  --region="${REGION}" \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}"

echo "=================================================================="
echo " Provisioning Complete!"
echo " Hosting URL  : https://${PROJECT_ID}.web.app"
echo " Function URL : https://${REGION}-${PROJECT_ID}.cloudfunctions.net/api"
echo " Health Check : https://${REGION}-${PROJECT_ID}.cloudfunctions.net/api/health"
echo "=================================================================="
