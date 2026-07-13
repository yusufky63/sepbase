CREATE TABLE IF NOT EXISTS sepbase_x402_prepared_plans (
  quote_id text PRIMARY KEY CHECK (quote_id ~ '^sha256:[0-9a-f]{64}$'),
  plan_id text NOT NULL UNIQUE CHECK (plan_id ~ '^sha256:[0-9a-f]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_envelope jsonb NOT NULL,
  expires_at numeric(78, 0) NOT NULL CHECK (expires_at > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sepbase_x402_challenges (
  quote_id text PRIMARY KEY CHECK (quote_id ~ '^sha256:[0-9a-f]{64}$'),
  plan_id text NOT NULL UNIQUE CHECK (plan_id ~ '^sha256:[0-9a-f]{64}$'),
  challenge_hash text NOT NULL CHECK (challenge_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sepbase_x402_registration_orders (
  payment_identifier text PRIMARY KEY
    CHECK (payment_identifier ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_fingerprint text NOT NULL
    CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  payment_payload_hash text NOT NULL
    CHECK (payment_payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  payment_authorization_hash text NOT NULL UNIQUE
    CHECK (payment_authorization_hash ~ '^sha256:[0-9a-f]{64}$'),
  plan_id text NOT NULL UNIQUE
    CHECK (plan_id ~ '^sha256:[0-9a-f]{64}$'),
  quote_id text NOT NULL UNIQUE
    CHECK (quote_id ~ '^sha256:[0-9a-f]{64}$'),
  reservation_hash text NOT NULL
    CHECK (reservation_hash ~ '^sha256:[0-9a-f]{64}$'),
  reservation_envelope jsonb NOT NULL,
  lease_seconds integer NOT NULL CHECK (lease_seconds BETWEEN 60 AND 900),
  status text NOT NULL CHECK (status IN (
    'reserved',
    'verified',
    'commit-submitted',
    'reveal-ready',
    'reveal-submitted',
    'confirmed',
    'reconciliation-required',
    'settled',
    'terminal-failure'
  )),
  version bigint NOT NULL CHECK (version BETWEEN 0 AND 9007199254740991),
  refund_disposition text NOT NULL CHECK (refund_disposition IN (
    'not-required-unsettled',
    'not-applicable-registered',
    'manual-review'
  )),
  commit_transaction text NULL
    CHECK (commit_transaction IS NULL OR commit_transaction ~ '^0x[0-9a-fA-F]{64}$'),
  reveal_transaction text NULL
    CHECK (reveal_transaction IS NULL OR reveal_transaction ~ '^0x[0-9a-fA-F]{64}$'),
  settlement_transaction text NULL
    CHECK (settlement_transaction IS NULL OR settlement_transaction ~ '^0x[0-9a-fA-F]{64}$'),
  settlement_response_envelope jsonb NULL,
  error_code text NULL
    CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_]{1,96}$'),
  lease_token_hash text NULL
    CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  lease_fencing_token numeric(78, 0) NOT NULL CHECK (lease_fencing_token > 0),
  lease_expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (lease_token_hash IS NULL AND lease_expires_at IS NULL)
    OR (lease_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS sepbase_x402_orders_status_updated_idx
  ON sepbase_x402_registration_orders (status, updated_at);

CREATE INDEX IF NOT EXISTS sepbase_x402_orders_lease_expiry_idx
  ON sepbase_x402_registration_orders (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;
