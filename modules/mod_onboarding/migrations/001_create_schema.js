'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('mod_onboarding');

  // Anonymous funnel sessions (no auth required)
  pgm.createTable('funnel_sessions', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    income:        { type: 'numeric(12,2)', default: null },
    nm_debt:       { type: 'numeric(12,2)', default: null },
    mort_debt:     { type: 'numeric(12,2)', default: null },
    blended_rate:  { type: 'numeric(5,3)', default: null },
    monthly_bleed: { type: 'numeric(12,2)', default: null },
    lifetime_bleed: { type: 'numeric(14,2)', default: null },
    referrer:      { type: 'text', default: null },
    completed_step: { type: 'integer', default: 1 },
    created_at:    { type: 'timestamp', default: pgm.func('now()') },
    updated_at:    { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('funnel_sessions', ['created_at']);
  pgm.createIndex('funnel_sessions', ['referrer']);

  // Forensic answers per session
  pgm.createTable('forensic_answers', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id:  { type: 'uuid', references: 'funnel_sessions(id)', onDelete: 'CASCADE' },
    question_id: { type: 'smallint', notNull: true },
    answer:      { type: 'boolean', notNull: true },
    answered_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('forensic_answers', ['session_id']);

  // Analytics events
  pgm.createTable('onboarding_events', {
    id:        { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id: { type: 'uuid', references: 'funnel_sessions(id)', onDelete: 'SET NULL' },
    user_id:    { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' },
    event_name: { type: 'text', notNull: true },
    metadata:   { type: 'jsonb', default: '{}' },
    created_at: { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('onboarding_events', ['event_name']);
  pgm.createIndex('onboarding_events', ['session_id']);
  pgm.createIndex('onboarding_events', ['created_at']);

  // Vault records (created users from funnel)
  pgm.createTable('vault_users', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:      { type: 'integer', references: 'users(id)', onDelete: 'CASCADE', unique: true },
    session_id:   { type: 'uuid', references: 'funnel_sessions(id)', onDelete: 'SET NULL' },
    salary:       { type: 'numeric(12,2)', default: null },
    pdf_uploaded: { type: 'boolean', default: false },
    phase_zero_complete: { type: 'boolean', default: false },
    created_at:   { type: 'timestamp', default: pgm.func('now()') },
  });

  // Exit capture email captures
  pgm.createTable('exit_captures', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id:   { type: 'uuid', references: 'funnel_sessions(id)', onDelete: 'CASCADE' },
    email_hash:   { type: 'text', notNull: true },
    lifetime_bleed_at_capture: { type: 'numeric(14,2)' },
    created_at:   { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('exit_captures', ['email_hash']);

  // Delayed email queue for exit capture recovery sequence (Emails 2 & 3)
  pgm.createTable('delayed_emails', {
    id:        { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    recipient:  { type: 'text', notNull: true },
    subject:    { type: 'text', notNull: true },
    body_plain: { type: 'text', default: '' },
    body_html:  { type: 'text', default: null },
    send_at:    { type: 'timestamp', notNull: true },
    sent_at:    { type: 'timestamp', default: null },
    failed_at:  { type: 'timestamp', default: null },
    metadata:   { type: 'jsonb', default: '{}' },
    created_at:  { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('delayed_emails', ['send_at']);
  pgm.createIndex('delayed_emails', ['sent_at']);
};

exports.down = (pgm) => {
  pgm.dropSchema('mod_onboarding', { cascade: true });
};