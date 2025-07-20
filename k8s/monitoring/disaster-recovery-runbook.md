# URL Shortener Platform - Disaster Recovery Runbook

## Overview

This runbook provides step-by-step procedures for recovering from various disaster scenarios that might affect the URL Shortener Platform. It covers database failures, service outages, and complete environment recovery.

## Prerequisites

- AWS CLI configured with appropriate permissions
- kubectl configured with access to the Kubernetes cluster
- Helm installed
- Access to backup storage (S3 bucket)

## Contact Information

| Role | Name | Contact |
|------|------|---------|
| Primary On-Call | DevOps Team | devops-oncall@example.com, +1-555-123-4567 |
| Database Admin | DBA Team | dba-oncall@example.com, +1-555-123-4568 |
| Platform Lead | Platform Team | platform-lead@example.com, +1-555-123-4569 |

## 1. Database Recovery Procedures

### 1.1 PostgreSQL Recovery

#### Complete Database Failure

1. **Assess the situation**:
   ```bash
   kubectl -n url-shortener-production get pods | grep postgres
   kubectl -n url-shortener-production logs deploy/postgres
   ```

2. **Stop dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment url-shortener --replicas=0
   kubectl -n url-shortener-production scale deployment user-management --replicas=0
   ```

3. **Restore from latest backup**:
   ```bash
   # Find the latest backup
   aws s3 ls s3://url-shortener-backups/production/ --region us-east-1 | sort | tail -n 1
   
   # Download the backup
   BACKUP_DATE=$(aws s3 ls s3://url-shortener-backups/production/ --region us-east-1 | sort | tail -n 1 | awk '{print $2}' | sed 's/\///')
   aws s3 cp s3://url-shortener-backups/production/${BACKUP_DATE}/postgres-full-${BACKUP_DATE}.sql.gz /tmp/
   
   # Restore the database
   kubectl -n url-shortener-production exec -i deploy/postgres -- bash -c "gunzip -c | psql -U postgres" < /tmp/postgres-full-${BACKUP_DATE}.sql.gz
   ```

4. **Verify data integrity**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/postgres -- psql -U postgres -c "SELECT COUNT(*) FROM users;"
   kubectl -n url-shortener-production exec -i deploy/postgres -- psql -U postgres -c "SELECT COUNT(*) FROM short_urls;"
   ```

5. **Restart dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment url-shortener --replicas=3
   kubectl -n url-shortener-production scale deployment user-management --replicas=2
   ```

#### Point-in-Time Recovery

For recovering to a specific point in time (if WAL archiving is enabled):

1. **Identify target recovery time**:
   ```bash
   # Find available WAL archives
   aws s3 ls s3://url-shortener-backups/production/wal/ --region us-east-1
   ```

2. **Create recovery.conf**:
   ```
   restore_command = 'aws s3 cp s3://url-shortener-backups/production/wal/%f %p --region us-east-1'
   recovery_target_time = '2025-07-16 08:00:00 UTC'
   ```

3. **Follow steps 2-5 from the Complete Database Failure procedure**

### 1.2 ClickHouse Recovery

1. **Assess the situation**:
   ```bash
   kubectl -n url-shortener-production get pods | grep clickhouse
   kubectl -n url-shortener-production logs deploy/clickhouse
   ```

2. **Stop dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment analytics --replicas=0
   ```

3. **Restore from latest backup**:
   ```bash
   # Find the latest backup
   BACKUP_DATE=$(aws s3 ls s3://url-shortener-backups/production/ --region us-east-1 | sort | tail -n 1 | awk '{print $2}' | sed 's/\///')
   
   # Restore the database
   kubectl -n url-shortener-production exec -i deploy/clickhouse -- clickhouse-client --query="RESTORE DATABASE analytics FROM S3('url-shortener-backups/clickhouse/${BACKUP_DATE}/analytics', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY')"
   ```

4. **Verify data integrity**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/clickhouse -- clickhouse-client --query="SELECT COUNT(*) FROM analytics.click_events"
   ```

5. **Restart dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment analytics --replicas=2
   ```

### 1.3 Redis Recovery

1. **Assess the situation**:
   ```bash
   kubectl -n url-shortener-production get pods | grep redis
   kubectl -n url-shortener-production logs deploy/redis
   ```

2. **Stop dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment url-shortener --replicas=0
   ```

3. **Restore from latest backup**:
   ```bash
   # Find the latest backup
   BACKUP_DATE=$(aws s3 ls s3://url-shortener-backups/production/ --region us-east-1 | sort | tail -n 1 | awk '{print $2}' | sed 's/\///')
   
   # Download the backup
   aws s3 cp s3://url-shortener-backups/production/${BACKUP_DATE}/redis-${BACKUP_DATE}.rdb /tmp/
   
   # Copy to Redis pod
   kubectl -n url-shortener-production cp /tmp/redis-${BACKUP_DATE}.rdb deploy/redis:/data/dump.rdb
   
   # Restart Redis
   kubectl -n url-shortener-production rollout restart deploy/redis
   ```

4. **Verify data integrity**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/redis -- redis-cli INFO keyspace
   ```

5. **Restart dependent services**:
   ```bash
   kubectl -n url-shortener-production scale deployment url-shortener --replicas=3
   ```

## 2. Service Recovery Procedures

### 2.1 URL Shortener Service Failure

1. **Assess the situation**:
   ```bash
   kubectl -n url-shortener-production get pods | grep url-shortener
   kubectl -n url-shortener-production logs deploy/url-shortener
   ```

2. **Check dependencies**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/url-shortener -- curl -s http://redis:6379 || echo "Redis connection issue"
   kubectl -n url-shortener-production exec -i deploy/url-shortener -- curl -s http://postgres:5432 || echo "PostgreSQL connection issue"
   ```

3. **Restart the service**:
   ```bash
   kubectl -n url-shortener-production rollout restart deploy/url-shortener
   ```

4. **Verify service health**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/url-shortener -- curl -s http://localhost:3000/health
   ```

5. **Monitor logs and metrics**:
   ```bash
   kubectl -n url-shortener-production logs -f deploy/url-shortener
   ```

### 2.2 Analytics Service Failure

1. **Assess the situation**:
   ```bash
   kubectl -n url-shortener-production get pods | grep analytics
   kubectl -n url-shortener-production logs deploy/analytics
   ```

2. **Check dependencies**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/analytics -- curl -s http://clickhouse:8123 || echo "ClickHouse connection issue"
   kubectl -n url-shortener-production exec -i deploy/analytics -- curl -s http://rabbitmq:5672 || echo "RabbitMQ connection issue"
   ```

3. **Restart the service**:
   ```bash
   kubectl -n url-shortener-production rollout restart deploy/analytics
   ```

4. **Verify service health**:
   ```bash
   kubectl -n url-shortener-production exec -i deploy/analytics -- curl -s http://localhost:3000/health
   ```

5. **Monitor logs and metrics**:
   ```bash
   kubectl -n url-shortener-production logs -f deploy/analytics
   ```

## 3. Complete Environment Recovery

### 3.1 Kubernetes Cluster Failure

In case of a complete cluster failure:

1. **Create a new Kubernetes cluster**:
   ```bash
   # Using infrastructure as code (Terraform, CloudFormation, etc.)
   cd infrastructure
   terraform apply -var environment=production
   ```

2. **Configure kubectl to use the new cluster**:
   ```bash
   aws eks update-kubeconfig --name url-shortener-production --region us-east-1
   ```

3. **Restore core infrastructure**:
   ```bash
   # Create namespaces
   kubectl apply -f k8s/base/namespace.yaml
   
   # Deploy storage resources
   kubectl apply -f k8s/base/persistent-volumes.yaml
   
   # Deploy database services
   kubectl apply -f k8s/base/database-deployments.yaml
   ```

4. **Restore databases from backups**:
   Follow procedures in sections 1.1, 1.2, and 1.3 for database recovery.

5. **Deploy application services**:
   ```bash
   # Deploy all application services
   kubectl apply -f k8s/base/
   kubectl apply -f k8s/overlays/prod/
   ```

6. **Verify environment health**:
   ```bash
   kubectl get pods -n url-shortener-production
   ```

7. **Update DNS records**:
   ```bash
   # Get new load balancer address
   kubectl -n url-shortener-production get svc istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
   
   # Update DNS records using your DNS provider's CLI or API
   ```

### 3.2 Data Center Outage

In case of a complete data center outage:

1. **Activate the standby region**:
   ```bash
   # Update DNS to point to the standby region
   aws route53 change-resource-record-sets --hosted-zone-id ZXXXXXXXXXXXXX --change-batch file://dns-failover.json
   ```

2. **Scale up resources in the standby region**:
   ```bash
   kubectl config use-context url-shortener-dr
   kubectl -n url-shortener-production scale deployment --all --replicas=3
   ```

3. **Verify services in the standby region**:
   ```bash
   kubectl get pods -n url-shortener-production
   ```

4. **Monitor the failover**:
   ```bash
   # Check metrics and logs in the DR environment
   ```

## 4. Recovery Testing Procedures

Regular recovery testing should be performed to ensure these procedures work as expected:

1. **Quarterly database recovery test**:
   - Schedule a test restoration to a separate environment
   - Verify data integrity
   - Document recovery time and any issues encountered

2. **Monthly service failover test**:
   - Simulate service failures in a test environment
   - Verify automatic recovery mechanisms
   - Document recovery time and any issues encountered

3. **Bi-annual full DR test**:
   - Simulate a complete environment failure
   - Follow the complete environment recovery procedure
   - Document recovery time and any issues encountered

## 5. Post-Incident Procedures

After any recovery operation:

1. **Document the incident**:
   - What happened
   - Root cause analysis
   - Recovery steps taken
   - Time to recovery
   - Lessons learned

2. **Update runbooks**:
   - Add any new procedures discovered
   - Update existing procedures if needed
   - Review automation opportunities

3. **Conduct a post-mortem meeting**:
   - Review the incident with all stakeholders
   - Identify preventive measures
   - Assign action items for improvement