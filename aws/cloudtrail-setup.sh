#!/usr/bin/env bash
# One-time setup of the account's CloudTrail trail (fix list R4, 22 Oct 2026).
# Records every AWS API action in all regions to its own private bucket, with
# log file validation so any later change to a log file can be detected.
# Safe to re-run: each step skips what already exists.
set -euo pipefail

REGION=ap-south-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="cercit-cloudtrail-${ACCOUNT}"
TRAIL=cercit-account-trail

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
# keep logs 1 year, then expire (current and old versions)
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-after-1-year","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":365},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}]}'

POLICY=$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Sid":"AclCheck","Effect":"Allow","Principal":{"Service":"cloudtrail.amazonaws.com"},
  "Action":"s3:GetBucketAcl","Resource":"arn:aws:s3:::${BUCKET}",
  "Condition":{"StringEquals":{"aws:SourceArn":"arn:aws:cloudtrail:${REGION}:${ACCOUNT}:trail/${TRAIL}"}}},
 {"Sid":"Write","Effect":"Allow","Principal":{"Service":"cloudtrail.amazonaws.com"},
  "Action":"s3:PutObject","Resource":"arn:aws:s3:::${BUCKET}/AWSLogs/${ACCOUNT}/*",
  "Condition":{"StringEquals":{"s3:x-amz-acl":"bucket-owner-full-control",
   "aws:SourceArn":"arn:aws:cloudtrail:${REGION}:${ACCOUNT}:trail/${TRAIL}"}}},
 {"Sid":"TlsOnly","Effect":"Deny","Principal":"*","Action":"s3:*",
  "Resource":["arn:aws:s3:::${BUCKET}","arn:aws:s3:::${BUCKET}/*"],
  "Condition":{"Bool":{"aws:SecureTransport":"false"}}}
]}
EOF
)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY"

if ! aws cloudtrail get-trail --name "$TRAIL" --region "$REGION" >/dev/null 2>&1; then
  aws cloudtrail create-trail --name "$TRAIL" --s3-bucket-name "$BUCKET" --region "$REGION" \
    --is-multi-region-trail --include-global-service-events --enable-log-file-validation
fi
aws cloudtrail start-logging --name "$TRAIL" --region "$REGION"
aws cloudtrail get-trail-status --name "$TRAIL" --region "$REGION" --query '{logging:IsLogging,lastDelivery:LatestDeliveryTime}'
