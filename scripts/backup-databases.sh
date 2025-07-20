#!/bin/bash
set -e

# Configuration
ENVIRONMENT=${ENVIRONMENT:-"production"}
NAMESPACE="url-shortener-${ENVIRONMENT}"
BACKUP_DIR="/mnt/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d-%H%M%S)
S3_BUCKET="url-shortener-backups"
AWS_REGION="us-east-1"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting database backup for URL Shortener Platform${NC}"
echo -e "Environment: ${GREEN}${ENVIRONMENT}${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"
echo -e "Backup timestamp: ${GREEN}${DATE}${NC}"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}/${DATE}

# Backup PostgreSQL databases
echo -e "${YELLOW}Backing up PostgreSQL databases...${NC}"
kubectl exec -n ${NAMESPACE} deploy/postgres -- pg_dumpall -c -U postgres | gzip > ${BACKUP_DIR}/${DATE}/postgres-full-${DATE}.sql.gz

# Backup specific PostgreSQL databases with schema only for large tables
echo -e "${YELLOW}Backing up PostgreSQL schemas...${NC}"
kubectl exec -n ${NAMESPACE} deploy/postgres -- pg_dump -U postgres -d url_shortener --schema-only | gzip > ${BACKUP_DIR}/${DATE}/postgres-schema-${DATE}.sql.gz

# Backup ClickHouse databases
echo -e "${YELLOW}Backing up ClickHouse databases...${NC}"
kubectl exec -n ${NAMESPACE} deploy/clickhouse -- clickhouse-client --query="BACKUP DATABASE analytics TO S3('${S3_BUCKET}/clickhouse/${DATE}/analytics', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY')"

# Backup Redis data
echo -e "${YELLOW}Backing up Redis data...${NC}"
kubectl exec -n ${NAMESPACE} deploy/redis -- redis-cli SAVE
kubectl cp ${NAMESPACE}/deploy/redis:/data/dump.rdb ${BACKUP_DIR}/${DATE}/redis-${DATE}.rdb

# Upload backups to S3
echo -e "${YELLOW}Uploading backups to S3...${NC}"
aws s3 sync ${BACKUP_DIR}/${DATE} s3://${S3_BUCKET}/${ENVIRONMENT}/${DATE}/ --region ${AWS_REGION}

# Verify backups
echo -e "${YELLOW}Verifying backups...${NC}"
POSTGRES_BACKUP_SIZE=$(du -h ${BACKUP_DIR}/${DATE}/postgres-full-${DATE}.sql.gz | cut -f1)
REDIS_BACKUP_SIZE=$(du -h ${BACKUP_DIR}/${DATE}/redis-${DATE}.rdb | cut -f1)

echo -e "PostgreSQL backup size: ${GREEN}${POSTGRES_BACKUP_SIZE}${NC}"
echo -e "Redis backup size: ${GREEN}${REDIS_BACKUP_SIZE}${NC}"

# Clean up old backups (local)
echo -e "${YELLOW}Cleaning up old local backups...${NC}"
find ${BACKUP_DIR} -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

# Clean up old backups (S3)
echo -e "${YELLOW}Cleaning up old S3 backups...${NC}"
OLD_BACKUPS=$(aws s3 ls s3://${S3_BUCKET}/${ENVIRONMENT}/ --region ${AWS_REGION} | grep -v "${DATE}" | awk '{print $2}' | sort | head -n -${RETENTION_DAYS})
for backup in ${OLD_BACKUPS}; do
  echo "Removing old backup: ${backup}"
  aws s3 rm s3://${S3_BUCKET}/${ENVIRONMENT}/${backup} --recursive --region ${AWS_REGION}
done

# Send notification
echo -e "${YELLOW}Sending backup notification...${NC}"
BACKUP_STATUS="success"
BACKUP_MESSAGE="Database backup completed successfully for ${ENVIRONMENT} environment."

# Send to Slack
curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"${BACKUP_MESSAGE}\", \"attachments\": [{\"color\": \"good\", \"fields\": [{\"title\": \"Environment\", \"value\": \"${ENVIRONMENT}\", \"short\": true}, {\"title\": \"Timestamp\", \"value\": \"${DATE}\", \"short\": true}, {\"title\": \"PostgreSQL Size\", \"value\": \"${POSTGRES_BACKUP_SIZE}\", \"short\": true}, {\"title\": \"Redis Size\", \"value\": \"${REDIS_BACKUP_SIZE}\", \"short\": true}]}]}" \
  ${SLACK_WEBHOOK_URL}

echo -e "${GREEN}Database backup completed successfully!${NC}"