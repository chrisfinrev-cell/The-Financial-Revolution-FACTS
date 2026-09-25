'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('delayed_emails', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    recipient:   { type: 'text', notNull: true },
    subject:     { type: 'text', notNull: true },
    body_plain:   { type: 'text', notNull: true },
    sent:        { type: 'boolean', default: false },
    send_at:     { type: 'timestamp', notNull: true },
    created_at:   { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('delayed_emails', ['send_at']);
  pgm.createIndex('delayed_emails', ['sent']);
};

exports.down = (pgm) => {
  pgm.dropTable('delayed_emails');
};