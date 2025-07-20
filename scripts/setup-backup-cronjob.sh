#!/bin/bash
set -e

# Configuration
ENVIRONMENT=${ENVIRONMENT:-"production"}
NAMESPACE="url-shortener-${ENVIRONMENT}"
BACKUP_SCHEDULE=${BACKUP_SCHEDULE:-"0 1 * * *"} # Default: Every day at 1 AM
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
S3_BUCKET=${S3_BUCKET:-"url-shortener-backups"}
AWS_REGION=${AWS_REGION:-"us-east-1"}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up automated database backups for URL Shortener Platform${NC}"
echo -e "Environment: ${GREEN}${ENVIRONMENT}${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"
echo -e "Schedule: ${GREEN}${BACKUP_SCHEDULE}${NC}"
echo -e "Retention: ${GREEN}${BACKUP_RETENTION_DAYS} days${NC}"
echo -e "S3 Bucket: ${GREEN}${S3_BUCKET}${NC}"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl is not installed. Please install it first.${NC}"
    exit 1
fi

# Create backup service account
echo -e "${YELLOW}Creating backup service account...${NC}"
kubectl create serviceaccount database-backup -n ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# Create role with permissions to exec into pods
echo -e "${YELLOW}Creating backup role and role binding...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: database-backup-role
  namespace: ${NAMESPACE}
spec:
  rules:
  - apiGroups: [""]
    resources: ["pods", "pods/exec"]
    verbs: ["get", "list", "create"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get", "list"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "create", "delete"]
EOF

# Create role binding
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: database-backup-rolebinding
  namespace: ${NAMESPACE}
subjects:
- kind: ServiceAccount
  name: database-backup
  namespace: ${NAMESPACE}
roleRef:
  kind: Role
  name: database-backup-role
  apiGroup: rbac.authorization.k8s.io
EOF

# Create AWS credentials secret for S3 access
echo -e "${YELLOW}Creating AWS credentials secret...${NC}"
read -p "Enter AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -sp "Enter AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
echo

kubectl create secret generic aws-backup-credentials \
  --from-literal=aws-access-key-id=${AWS_ACCESS_KEY_ID} \
  --from-literal=aws-secret-access-key=${AWS_SECRET_ACCESS_KEY} \
  --namespace=${NAMESPACE} \
  --dry-run=client -o yaml | kubectl apply -f -

# Create Slack webhook secret for notifications
echo -e "${YELLOW}Creating Slack webhook secret...${NC}"
read -p "Enter Slack webhook URL for backup notifications: " SLACK_WEBHOOK_URL

kubectl create secret generic backup-notification-secrets \
  --from-literal=slack-webhook-url=${SLACK_WEBHOOK_URL} \
  --namespace=${NAMESPACE} \
  --dry-run=client -o yaml | kubectl apply -f -

# Create persistent volume claim for backups
echo -e "${YELLOW}Creating backup storage...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-backups
  namespace: ${NAMESPACE}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
EOF

# Create CronJob for automated backups
echo -e "${YELLOW}Creating backup CronJob...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: ${NAMESPACE}
spec:
  schedule: "${BACKUP_SCHEDULE}"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 5
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: database-backup
          containers:
          - name: backup
            image: bitnami/kubectl:latest
            imagePullPolicy: IfNotPresent
            command:
            - /bin/bash
            - -c
            - |
              # Configuration
              NAMESPACE="${NAMESPACE}"
              BACKUP_DIR="/backups"
              RETENTION_DAYS=${BACKUP_RETENTION_DAYS}
              DATE=\$(date +%Y%m%d-%H%M%S)
              S3_BUCKET="${S3_BUCKET}"
              AWS_REGION="${AWS_REGION}"
              AWS_ACCESS_KEY_ID=\$(cat /etc/aws-credentials/aws-access-key-id)
              AWS_SECRET_ACCESS_KEY=\$(cat /etc/aws-credentials/aws-secret-access-key)
              SLACK_WEBHOOK_URL=\$(cat /etc/notification-secrets/slack-webhook-url)
              
              # Create backup directory
              mkdir -p \${BACKUP_DIR}/\${DATE}
              
              echo "Starting database backup - \${DATE}"
              
              # Backup PostgreSQL databases
              echo "Backing up PostgreSQL databases..."
              kubectl exec -n \${NAMESPACE} deploy/postgres -- pg_dumpall -c -U postgres > \${BACKUP_DIR}/\${DATE}/postgres-full-\${DATE}.sql
              gzip \${BACKUP_DIR}/\${DATE}/postgres-full-\${DATE}.sql
              
              # Backup PostgreSQL schemas
              echo "Backing up PostgreSQL schemas..."
              kubectl exec -n \${NAMESPACE} deploy/postgres -- pg_dump -U postgres -d url_shortener --schema-only > \${BACKUP_DIR}/\${DATE}/postgres-schema-\${DATE}.sql
              gzip \${BACKUP_DIR}/\${DATE}/postgres-schema-\${DATE}.sql
              
              # Backup ClickHouse databases
              echo "Backing up ClickHouse databases..."
              kubectl exec -n \${NAMESPACE} deploy/clickhouse -- clickhouse-client --query="BACKUP DATABASE analytics TO S3('\${S3_BUCKET}/clickhouse/\${DATE}/analytics', '\${AWS_ACCESS_KEY_ID}', '\${AWS_SECRET_ACCESS_KEY}')"
              
              # Backup Redis data
              echo "Backing up Redis data..."
              kubectl exec -n \${NAMESPACE} deploy/redis -- redis-cli SAVE
              kubectl cp \${NAMESPACE}/deploy/redis:/data/dump.rdb \${BACKUP_DIR}/\${DATE}/redis-\${DATE}.rdb
              
              # Upload backups to S3
              echo "Uploading backups to S3..."
              export AWS_ACCESS_KEY_ID=\${AWS_ACCESS_KEY_ID}
              export AWS_SECRET_ACCESS_KEY=\${AWS_SECRET_ACCESS_KEY}
              
              # Install AWS CLI
              apt-get update && apt-get install -y awscli
              
              # Upload to S3
              aws s3 sync \${BACKUP_DIR}/\${DATE} s3://\${S3_BUCKET}/\${ENVIRONMENT}/\${DATE}/ --region \${AWS_REGION}
              
              # Verify backups
              echo "Verifying backups..."
              POSTGRES_BACKUP_SIZE=\$(du -h \${BACKUP_DIR}/\${DATE}/postgres-full-\${DATE}.sql.gz | cut -f1)
              REDIS_BACKUP_SIZE=\$(du -h \${BACKUP_DIR}/\${DATE}/redis-\${DATE}.rdb | cut -f1)
              
              echo "PostgreSQL backup size: \${POSTGRES_BACKUP_SIZE}"
              echo "Redis backup size: \${REDIS_BACKUP_SIZE}"
              
              # Clean up old backups (local)
              echo "Cleaning up old local backups..."
              find \${BACKUP_DIR} -type d -mtime +\${RETENTION_DAYS} -exec rm -rf {} \\; 2>/dev/null || true
              
              # Clean up old backups (S3)
              echo "Cleaning up old S3 backups..."
              OLD_BACKUPS=\$(aws s3 ls s3://\${S3_BUCKET}/\${ENVIRONMENT}/ --region \${AWS_REGION} | grep -v "\${DATE}" | awk '{print \$2}' | sort | head -n -\${RETENTION_DAYS})
              for backup in \${OLD_BACKUPS}; do
                echo "Removing old backup: \${backup}"
                aws s3 rm s3://\${S3_BUCKET}/\${ENVIRONMENT}/\${backup} --recursive --region \${AWS_REGION}
              done
              
              # Send notification
              echo "Sending backup notification..."
              BACKUP_STATUS="success"
              BACKUP_MESSAGE="Database backup completed successfully for \${ENVIRONMENT} environment."
              
              # Send to Slack
              curl -X POST -H 'Content-type: application/json' \
                --data "{\\"text\\":\\"\${BACKUP_MESSAGE}\\", \\"attachments\\": [{\\"color\\": \\"good\\", \\"fields\\": [{\\"title\\": \\"Environment\\", \\"value\\": \\"\${ENVIRONMENT}\\", \\"short\\": true}, {\\"title\\": \\"Timestamp\\", \\"value\\": \\"\${DATE}\\", \\"short\\": true}, {\\"title\\": \\"PostgreSQL Size\\", \\"value\\": \\"\${POSTGRES_BACKUP_SIZE}\\", \\"short\\": true}, {\\"title\\": \\"Redis Size\\", \\"value\\": \\"\${REDIS_BACKUP_SIZE}\\", \\"short\\": true}]}]}" \
                \${SLACK_WEBHOOK_URL}
              
              echo "Database backup completed successfully!"
            volumeMounts:
            - name: backup-storage
              mountPath: /backups
            - name: aws-credentials
              mountPath: /etc/aws-credentials
              readOnly: true
            - name: notification-secrets
              mountPath: /etc/notification-secrets
              readOnly: true
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: database-backups
          - name: aws-credentials
            secret:
              secretName: aws-backup-credentials
          - name: notification-secrets
            secret:
              secretName: backup-notification-secrets
          restartPolicy: OnFailure
EOF

echo -e "${GREEN}Automated database backup setup completed!${NC}"
echo -e "${YELLOW}Backup schedule: ${BACKUP_SCHEDULE}${NC}"
echo -e "${YELLOW}Backups will be stored in S3 bucket: ${S3_BUCKET}${NC}"
echo -e "${YELLOW}To run a backup manually:${NC}"
echo -e "  kubectl create job --from=cronjob/database-backup manual-backup-\$(date +%s) -n ${NAMESPACE}"