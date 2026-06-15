-- 1. Full Reset: Drop existing database		
DROP DATABASE IF EXISTS ssuet_qr_library;
CREATE DATABASE ssuet_qr_library;
USE ssuet_qr_library;

-- 2. Students Table
CREATE TABLE students (
    student_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, 
    department VARCHAR(50) NOT NULL,
    semester INT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    -- ADDED FOR ASSIGNMENT #2 & #3 FINES REQUIREMENT
    unpaid_balance DECIMAL(10, 2) DEFAULT 0.00 
);

-- 3. Librarians Table (Separate from students)
CREATE TABLE librarians (
    admin_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE'
);

-- 4. Library Inventory
CREATE TABLE books (
    book_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) UNIQUE NOT NULL,
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    department_category VARCHAR(50) NOT NULL,
    availability ENUM('AVAILABLE', 'ISSUED') DEFAULT 'AVAILABLE',
    -- ADDED FOR ASSIGNMENT #3 LEADERBOARDS / POPULARITY RECOMMENDATIONS
    borrow_count INT DEFAULT 0 
);

-- 5. Circulation Log (References both tables separately)
CREATE TABLE transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    student_id VARCHAR(20),
    book_id INT,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NULL,
    status ENUM('ISSUED', 'RETURNED') DEFAULT 'ISSUED',
    -- ADDED FOR ASSIGNMENT #2 AUTOMATED AUDIT & TRANSACTION METRICS
    fine_amount DECIMAL(10, 2) DEFAULT 0.00,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (book_id) REFERENCES books(book_id)
);

-- 6. Audit Logs
CREATE TABLE activity_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'LOGIN', 'BOOK ISSUE', 'BOOK RETURN', 'FAILED ATTEMPT'
    user_id VARCHAR(20) NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Seed Data
INSERT INTO students (student_id, name, email, password, department, semester, unpaid_balance) VALUES 
('2024F-BCS-005', 'Muhammad Zeeshan Siddiqui', 'student@ssuet.edu.pk', 'ssuet12345', 'Computer Science', 4, 0.00);

INSERT INTO librarians (admin_id, name, email, password) VALUES 
('ADMIN-01', 'Dr. Anam Akbar', 'librarian@ssuet.edu.pk', 'admin12345');

INSERT INTO books (title, author, isbn, qr_code, department_category, borrow_count) VALUES 
('Fundamentals of Database Systems', 'Elmasri & Navathe', '978-0133970777', 'QR-DB-01', 'Computer Science', 14),
('Introduction to Algorithms', 'CLRS', '978-0262033848', 'QR-ALGO-02', 'Computer Science', 25);

INSERT INTO books (title, author, isbn, qr_code, department_category, borrow_count) VALUES 
('Operating System Concepts', 'Silberschatz, Galvin & Gagne', '978-1119456339', 'QR-OS-03', 'Computer Science', 18),
('Computer Organization and Design', 'Patterson & Hennessy', '978-0128119051', 'QR-COA-04', 'Computer Science', 9),
('Clean Code: A Handbook of Agile Software Craftsmanship', 'Robert C. Martin', '978-0132350884', 'QR-SE-05', 'Computer Science', 30),
('Web Development with Node and Express', 'Ethan Brown', '978-1492053514', 'QR-WEB-06', 'Computer Science', 22),
('Software Engineering: A Practitioners Approach', 'Roger S. Pressman', '978-1259872976', 'QR-SE-07', 'Software Engineering', 5),
('Data Communications and Networking', 'Behrouz A. Forouzan', '978-0073376226', 'QR-NET-08', 'Computer Science', 12),
('Artificial Intelligence: A Modern Approach', 'Stuart Russell & Peter Norvig', '978-0134610993', 'QR-AI-09', 'Computer Science', 17),
('Discrete Mathematics and its Applications', 'Kenneth H. Rosen', '978-1259676512', 'QR-MATH-10', 'Mathematics', 11),
('Modern Control Engineering', 'Katsuhiko Ogata', '978-0136156734', 'QR-EE-11', 'Electrical Engineering', 2),
('Digital Logic and Computer Design', 'M. Morris Mano', '978-0132145169', 'QR-DLD-12', 'Computer Science', 8);