USE docsndocs;

CREATE TABLE IF NOT EXISTS coupons (
 id VARCHAR(36) PRIMARY KEY, code VARCHAR(100) NOT NULL UNIQUE,
 label VARCHAR(255) NOT NULL,
 benefit_type VARCHAR(30) NOT NULL CHECK (benefit_type IN ('percent_off','free_activation')),
 percent_off INT NOT NULL DEFAULT 0 CHECK (percent_off BETWEEN 0 AND 100),
 enabled BOOLEAN NOT NULL DEFAULT TRUE, starts_at DATETIME NULL, expires_at DATETIME NULL,
 eligible_user_id BIGINT NULL, project_type VARCHAR(10) NULL CHECK (project_type IN ('solo','team')),
 max_redemptions INT NULL CHECK (max_redemptions > 0),
 max_per_user INT NOT NULL DEFAULT 1 CHECK (max_per_user > 0),
 max_collaborators INT NULL, max_documents INT NULL, max_days INT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS coupon_redemptions (
 id VARCHAR(36) PRIMARY KEY, coupon_id VARCHAR(36) NOT NULL,
 user_id BIGINT NOT NULL, project_id VARCHAR(36) NOT NULL, project_type VARCHAR(10) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK (status IN ('reserved','redeemed','released')),
 benefit_type VARCHAR(30) NOT NULL, discount_cents INT NOT NULL, amount_cents INT NOT NULL DEFAULT 0, subscription_id VARCHAR(255) NULL UNIQUE,
 redeemed_at DATETIME NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (coupon_id) REFERENCES coupons(id),
 INDEX idx_coupon_project (coupon_id,user_id,project_id,project_type,status)
) ENGINE=InnoDB;
INSERT IGNORE INTO coupons (id,code,label,benefit_type,percent_off) VALUES
 ('legacy-welcome10','WELCOME10','Welcome voucher','percent_off',10),
 ('legacy-launch25','LAUNCH25','Launch voucher','percent_off',25);
