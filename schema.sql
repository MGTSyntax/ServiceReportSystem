-- ============================================================
-- srf_system schema
-- A separate database from dtr_system — run this against your
-- MySQL server to set up the IT Service Report system.
-- ============================================================

CREATE DATABASE IF NOT EXISTS srf_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE srf_system;

CREATE TABLE IF NOT EXISTS reports (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reportNo              VARCHAR(50)  NOT NULL UNIQUE,

  -- Section A: Problem Details
  dateReported          DATE         NULL,
  attendedByTop         VARCHAR(50)  NULL,
  detachment            VARCHAR(100) NULL,
  reportedThru          VARCHAR(100) NULL,
  reportedBy            VARCHAR(150) NULL,
  problemDetails        TEXT         NULL,

  -- Section B/C/D
  initialFindings       TEXT         NULL,
  actionTaken           TEXT         NULL,
  remarks               TEXT         NULL,

  -- Classification (for tracking/reports, not on paper form)
  type                  VARCHAR(10)  NULL,   -- HW / SW / OT
  serviceType           VARCHAR(20)  NULL,   -- PM / ISSUANCE / REPAIR
  dept                  VARCHAR(10)  NULL,   -- OPS / HO / OTH
  assignedTo            VARCHAR(20)  NULL,   -- RAP / RCA / MGT / OTHER
  assignedOther         VARCHAR(100) NULL,

  -- Status & sign-off
  status                VARCHAR(10)  NOT NULL DEFAULT 'OP', -- OP / PEN / CL
  dateAttended          DATE         NULL,
  timeIn                TIME         NULL,
  timeOut               TIME         NULL,
  attendedBySignature   VARCHAR(150) NULL,
  verifiedBy            VARCHAR(150) NULL,
  notedBy               VARCHAR(150) NULL,

  archived              TINYINT(1)   NOT NULL DEFAULT 0,

  createdAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_status (status),
  INDEX idx_type (type),
  INDEX idx_dept (dept),
  INDEX idx_dateAttended (dateAttended),
  INDEX idx_archived (archived)
) ENGINE=InnoDB;

-- ============================================================
-- Preventive Maintenance schedule
-- Tracks recurring PM visits per detachment/site. Each entry's
-- nextDue auto-advances (lastDone + intervalMonths) once its
-- linked Service Report is saved from the "Mark Done" flow.
-- ============================================================
CREATE TABLE IF NOT EXISTS pm_schedule (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  detachment      VARCHAR(100) NOT NULL,
  dept            VARCHAR(10)  NULL,   -- OPS / HO / OTH
  equipment       VARCHAR(150) NULL,
  intervalMonths  INT          NOT NULL DEFAULT 3,
  lastDone        DATE         NULL,
  nextDue         DATE         NOT NULL,
  assignedTo      VARCHAR(20)  NULL,   -- RAP / MGT / RCA
  notes           TEXT         NULL,

  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_nextDue (nextDue),
  INDEX idx_dept (dept)
) ENGINE=InnoDB;
