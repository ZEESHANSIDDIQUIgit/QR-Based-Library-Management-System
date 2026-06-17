-- ============================================================
-- SSUET QR-BASED LIBRARY MANAGEMENT SYSTEM
-- Complete Database Schema with Multi-Branch, AI, Logging, Backup
-- ============================================================

DROP DATABASE IF EXISTS ssuet_qr_library;
CREATE DATABASE ssuet_qr_library;
USE ssuet_qr_library;

-- ============================================================
-- 1. ROLES & PERMISSIONS (RBAC)
-- ============================================================
CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(20) UNIQUE NOT NULL,
    description VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description) VALUES 
('student', 'Regular library user'),
('librarian', 'Library staff - can manage books and view reports'),
('admin', 'System administrator - full access');

-- ============================================================
-- 2. USERS (Unified user table with role-based access)
-- ============================================================
CREATE TABLE users (
    user_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL DEFAULT 1,
    department VARCHAR(50),
    semester INT,
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    failed_login_attempts INT DEFAULT 0,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- ============================================================
-- 3. LIBRARY BRANCHES (Multi-Branch Support)
-- ============================================================
CREATE TABLE branches (
    branch_id INT AUTO_INCREMENT PRIMARY KEY,
    branch_name VARCHAR(100) NOT NULL,
    branch_code VARCHAR(20) UNIQUE NOT NULL,
    location VARCHAR(200),
    contact_email VARCHAR(100),
    contact_phone VARCHAR(20),
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO branches (branch_name, branch_code, location, contact_email) VALUES 
('Main Library', 'MAIN-001', 'SSUET Main Campus', 'mainlib@ssuet.edu.pk'),
('City Campus Library', 'CITY-002', 'SSUET City Campus', 'citylib@ssuet.edu.pk');

-- ============================================================
-- 4. BOOK CATEGORIES
-- ============================================================
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (category_name, description) VALUES 
('Computer Science', 'CS and IT related books'),
('Software Engineering', 'SE and development books'),
('Electrical Engineering', 'EE and electronics books'),
('Mathematics', 'Math and statistics books'),
('Physics', 'Physics and applied sciences');

-- ============================================================
-- 5. BOOKS INVENTORY (with QR codes and branch support)
-- ============================================================
CREATE TABLE books (
    book_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) UNIQUE NOT NULL,
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    category_id INT,
    branch_id INT NOT NULL DEFAULT 1,
    availability ENUM('AVAILABLE', 'ISSUED', 'TRANSFERRED') DEFAULT 'AVAILABLE',
    borrow_count INT DEFAULT 0,
    added_by VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id),
    FOREIGN KEY (added_by) REFERENCES users(user_id)
);

-- ============================================================
-- 6. BOOK TRANSFERS (between branches)
-- ============================================================
CREATE TABLE book_transfers (
    transfer_id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    from_branch_id INT NOT NULL,
    to_branch_id INT NOT NULL,
    transferred_by VARCHAR(20) NOT NULL,
    transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('PENDING', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
    completed_date TIMESTAMP NULL,
    FOREIGN KEY (book_id) REFERENCES books(book_id),
    FOREIGN KEY (from_branch_id) REFERENCES branches(branch_id),
    FOREIGN KEY (to_branch_id) REFERENCES branches(branch_id),
    FOREIGN KEY (transferred_by) REFERENCES users(user_id)
);

-- ============================================================
-- 7. TRANSACTIONS (Issue/Return with fine tracking)
-- ============================================================
CREATE TABLE transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(20) NOT NULL,
    book_id INT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NULL,
    status ENUM('ISSUED', 'RETURNED', 'OVERDUE') DEFAULT 'ISSUED',
    fine_amount DECIMAL(10, 2) DEFAULT 0.00,
    fine_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP NULL,
    issued_by VARCHAR(20),
    returned_to VARCHAR(20),
    FOREIGN KEY (student_id) REFERENCES users(user_id),
    FOREIGN KEY (book_id) REFERENCES books(book_id),
    FOREIGN KEY (issued_by) REFERENCES users(user_id),
    FOREIGN KEY (returned_to) REFERENCES users(user_id)
);

-- ============================================================
-- 8. FINE PAYMENTS (Payment tracking)
-- ============================================================
CREATE TABLE fine_payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(20) NOT NULL,
    transaction_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('CASH', 'CARD', 'ONLINE') DEFAULT 'CASH',
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_by VARCHAR(20),
    FOREIGN KEY (student_id) REFERENCES users(user_id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    FOREIGN KEY (processed_by) REFERENCES users(user_id)
);

-- ============================================================
-- 9. ACTIVITY LOGS (Comprehensive audit trail)
-- ============================================================
CREATE TABLE activity_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(20) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    details TEXT NOT NULL,
    severity ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL') DEFAULT 'INFO',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. FAILED LOGIN ATTEMPTS (Security monitoring)
-- ============================================================
CREATE TABLE failed_logins (
    attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NULL,
    username_attempted VARCHAR(50),
    ip_address VARCHAR(45),
    reason VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. NOTIFICATIONS (User alerts)
-- ============================================================
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    type ENUM('DUE_REMINDER', 'FINE_ALERT', 'BOOK_AVAILABLE', 'RECOMMENDATION', 'SYSTEM') NOT NULL,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- ============================================================
-- 12. BACKUP LOGS (Backup & archival tracking)
-- ============================================================
CREATE TABLE backup_logs (
    backup_id INT AUTO_INCREMENT PRIMARY KEY,
    backup_type ENUM('MANUAL', 'SCHEDULED', 'AUTO') DEFAULT 'AUTO',
    file_path VARCHAR(500),
    file_size_mb DECIMAL(10, 2),
    status ENUM('SUCCESS', 'FAILED') DEFAULT 'SUCCESS',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 13. ARCHIVED TRANSACTIONS (Historical data)
-- ============================================================
CREATE TABLE archived_transactions (
    archive_id INT AUTO_INCREMENT PRIMARY KEY,
    original_transaction_id VARCHAR(50),
    student_id VARCHAR(20),
    book_id INT,
    issue_date DATE,
    return_date DATE,
    fine_amount DECIMAL(10, 2),
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX idx_books_qr ON books(qr_code);
CREATE INDEX idx_books_category ON books(category_id);
CREATE INDEX idx_books_branch ON books(branch_id);
CREATE INDEX idx_transactions_student ON transactions(student_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_due ON transactions(due_date);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- SEED DATA (with NEW bcrypt hashes from 2026-06-17)
-- ============================================================

-- Admin user (password: admin12345)
INSERT INTO users (user_id, name, email, password_hash, role_id, department, status) VALUES 
('ADMIN-01', 'Dr. Anam Akbar', 'admin@ssuet.edu.pk', '$2b$12$zJC9xjEKscf1ZfbKTP0SguMY0G0YHgE4RXEQbQRPc2lI35XYSfSiO', 3, 'Administration', 'ACTIVE');

-- Librarian user (password: lib12345)
INSERT INTO users (user_id, name, email, password_hash, role_id, department, status) VALUES 
('LIB-001', 'Mr. Ahmed Khan', 'librarian@ssuet.edu.pk', '$2b$12$zJC9xjEKscf1ZfbKTP0SgusRE5W.bC44jfeF4eNrkP.NsZ6B8fR5G', 2, 'Library Sciences', 'ACTIVE');

-- Student user (password: ssuet12345)
INSERT INTO users (user_id, name, email, password_hash, role_id, department, semester, status) VALUES 
('2024F-BCS-005', 'Muhammad Zeeshan Siddiqui', 'student@ssuet.edu.pk', '$2b$12$zJC9xjEKscf1ZfbKTP0SguX.N18DanqP4pVgyrNatTxPFFATMAfY.', 1, 'Computer Science', 4, 'ACTIVE');

-- Sample Books
INSERT INTO books (title, author, isbn, qr_code, category_id, branch_id, borrow_count) VALUES 
('Fundamentals of Database Systems', 'Elmasri & Navathe', '978-0133970777', 'QR-DB-01', 1, 1, 14),
('Introduction to Algorithms', 'CLRS', '978-0262033848', 'QR-ALGO-02', 1, 1, 25),
('Operating System Concepts', 'Silberschatz, Galvin & Gagne', '978-1119456339', 'QR-OS-03', 1, 1, 18),
('Computer Organization and Design', 'Patterson & Hennessy', '978-0128119051', 'QR-COA-04', 1, 1, 9),
('Clean Code', 'Robert C. Martin', '978-0132350884', 'QR-SE-05', 2, 1, 30),
('Web Development with Node and Express', 'Ethan Brown', '978-1492053514', 'QR-WEB-06', 1, 1, 22),
('Software Engineering: A Practitioners Approach', 'Roger S. Pressman', '978-1259872976', 'QR-SE-07', 2, 2, 5),
('Data Communications and Networking', 'Behrouz A. Forouzan', '978-0073376226', 'QR-NET-08', 1, 1, 12),
('Artificial Intelligence: A Modern Approach', 'Stuart Russell & Peter Norvig', '978-0134610993', 'QR-AI-09', 1, 1, 17),
('Discrete Mathematics and its Applications', 'Kenneth H. Rosen', '978-1259676512', 'QR-MATH-10', 4, 1, 11),
('Modern Control Engineering', 'Katsuhiko Ogata', '978-0136156734', 'QR-EE-11', 3, 1, 2),
('Digital Logic and Computer Design', 'M. Morris Mano', '978-0132145169', 'QR-DLD-12', 1, 1, 8);