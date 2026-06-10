CREATE DATABASE IF NOT EXISTS ssuet_qr_library;
USE ssuet_qr_library;

-- 1. Identity Access Roles Framework
CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(20) UNIQUE NOT NULL
);
INSERT INTO roles (role_name) VALUES ('STUDENT'), ('LIBRARIAN');

-- 2. Master Profiles System Users
CREATE TABLE students (
    student_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, 
    department VARCHAR(50) NOT NULL,
    semester INT NOT NULL,
    role_id INT DEFAULT 1,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- 3. Library Inventory Core Items
CREATE TABLE books (
    book_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) UNIQUE NOT NULL,
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    department_category VARCHAR(50) NOT NULL,
    availability ENUM('AVAILABLE', 'ISSUED') DEFAULT 'AVAILABLE'
);

-- 4. Central Dynamic Circulation Log
CREATE TABLE transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(20),
    book_id INT,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NULL,
    status ENUM('ISSUED', 'RETURNED') DEFAULT 'ISSUED',
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (book_id) REFERENCES books(book_id)
);

-- 5. Automated Fine Balances Ledger
CREATE TABLE fines (
    fine_id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(50),
    student_id VARCHAR(20),
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('UNPAID', 'PAID') DEFAULT 'UNPAID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- 6. Enterprise System Security Audits 
CREATE TABLE activity_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type ENUM('LOGIN', 'BOOK_ISSUE', 'BOOK_RETURN', 'FINE_PAYMENT', 'FAILED_ATTEMPT') NOT NULL,
    user_id VARCHAR(20) NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEED ACCOUNTS FOR VIVA TESTING (Password for both is: ssuet123)
INSERT INTO students (student_id, name, email, password, department, semester, role_id, status) VALUES 
('2024F-BCS-005', 'Muhammad Zeeshan Siddiqui', 'student@ssuet.edu.pk', '$2b$10$T8Z.1G8fH6Cshw.M9N.ZauW4Dsk6hU3H4kbyYV4vO9UfAepV7v8K6', 'Computer Science', 4, 1, 'ACTIVE'),
('ADMIN-01', 'Dr. Anam Akbar', 'librarian@ssuet.edu.pk', '$2b$10$T8Z.1G8fH6Cshw.M9N.ZauW4Dsk6hU3H4kbyYV4vO9UfAepV7v8K6', 'Computer Science', 0, 2, 'ACTIVE');

-- SEED BOOKS INVENTORY
INSERT INTO books (title, author, isbn, qr_code, department_category, availability) VALUES 
('Fundamentals of Database Systems', 'Elmasri & Navathe', '978-0133970777', 'QR-DB-01', 'Computer Science', 'AVAILABLE'),
('Introduction to Algorithms', 'CLRS', '978-0262033848', 'QR-ALGO-02', 'Computer Science', 'AVAILABLE'),
('Operating System Concepts', 'Silberschatz', '978-1118063330', 'QR-OS-03', 'Computer Science', 'AVAILABLE');