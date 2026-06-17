const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();

// =========================
// CORS CONFIGURATION
// =========================
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowed = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'https://localhost:3000',
            'https://localhost:5500'
        ];
        if (allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET || "SSUET_SECRET_KEY_2026";
const SALT_ROUNDS = 12;

// =========================
// ACTIVITY LOGGING SYSTEM
// =========================
async function logSystemAction(action, uid, details, severity = 'INFO', req = null) {
    try {
        const ip = req?.ip || req?.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req?.headers['user-agent'] || 'unknown';
        await db.query(
            "INSERT INTO activity_logs (action_type, user_id, ip_address, user_agent, details, severity) VALUES (?, ?, ?, ?, ?, ?)",
            [action, uid, ip, userAgent, details, severity]
        );
    } catch (err) {
        console.error("LOG ERROR:", err.message);
    }
}

async function logFailedLogin(username, reason, req = null) {
    try {
        const ip = req?.ip || req?.headers['x-forwarded-for'] || 'unknown';
        await db.query(
            "INSERT INTO failed_logins (username_attempted, ip_address, reason) VALUES (?, ?, ?)",
            [username, ip, reason]
        );
    } catch (err) {
        console.error("FAILED LOGIN LOG ERROR:", err.message);
    }
}

// =========================
// AUTH MIDDLEWARES (RBAC)
// =========================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ success: false, message: "No token provided." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ success: false, message: "Invalid or expired session." });
        req.user = user;
        next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `Access denied. Required role: ${roles.join(' or ')}` });
        }
        next();
    };
}

// =========================
// PASSWORD HASHING UTILITY
// =========================
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// =========================
// NOTIFICATION SYSTEM
// =========================
async function createNotification(userId, type, title, message) {
    try {
        await db.query(
            "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
            [userId, type, title, message]
        );
    } catch (err) {
        console.error("NOTIFICATION ERROR:", err.message);
    }
}

// =========================
// 1. AUTHENTICATION APIs
// =========================

// REGISTER (Student)
app.post('/api/auth/register', async (req, res) => {
    const { student_id, name, email, password, department, semester } = req.body;

    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(name)) {
        return res.status(400).json({ success: false, message: "Name must contain only alphabets." });
    }

    const idRegex = /^\d{4}[FS]-[A-Z]{2,5}-\d{3,}$/;
    const formattedId = student_id.toUpperCase();
    if (!idRegex.test(formattedId)) {
        return res.status(400).json({ success: false, message: "Invalid ID format. Required: 2024F-BCS-005" });
    }

    if (!email.toLowerCase().endsWith('@ssuet.edu.pk')) {
        return res.status(400).json({ success: false, message: "Official @ssuet.edu.pk email required." });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    try {
        const passwordHash = await hashPassword(password);
        await db.query(
            `INSERT INTO users (user_id, name, email, password_hash, role_id, department, semester, status)
             VALUES (?, ?, ?, ?, 1, ?, ?, 'ACTIVE')`,
            [formattedId, name, email.toLowerCase(), passwordHash, department, semester]
        );
        
        await logSystemAction("STUDENT_REGISTERED", formattedId, `New student registered: ${name}`, 'INFO', req);
        res.json({ success: true, message: "Registration successful." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: "Student ID or Email already exists." });
        }
        console.error("REGISTRATION ERROR:", err);
        res.status(500).json({ success: false, message: "Database error." });
    }
});

// LOGIN (Unified for all roles)
app.post('/api/auth/login', async (req, res) => {
    const { user_id, password, role } = req.body;

    if (!user_id || !password) {
        await logFailedLogin(user_id, "Missing credentials", req);
        return res.status(400).json({ success: false, message: "User ID and password are required." });
    }

    try {
        const [users] = await db.query(
            `SELECT u.*, r.role_name FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.user_id = ?`,
            [user_id.toUpperCase()]
        );

        if (users.length === 0) {
            await logFailedLogin(user_id, "User not found", req);
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        const user = users[0];

        if (user.status !== 'ACTIVE') {
            await logFailedLogin(user_id, `Account ${user.status}`, req);
            return res.status(403).json({ success: false, message: `Account is ${user.status}.` });
        }

        const validPassword = await verifyPassword(password, user.password_hash);
        if (!validPassword) {
            await db.query("UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE user_id = ?", [user_id]);
            
            if (user.failed_login_attempts >= 4) {
                await db.query("UPDATE users SET status = 'SUSPENDED' WHERE user_id = ?", [user_id]);
                await logSystemAction("ACCOUNT_SUSPENDED", user_id, "Account suspended due to multiple failed login attempts", 'WARNING', req);
            }
            
            await logFailedLogin(user_id, "Invalid password", req);
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        await db.query("UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE user_id = ?", [user_id]);

        const token = jwt.sign(
            { id: user.user_id, role: user.role_name, name: user.name },
            JWT_SECRET,
            { expiresIn: "2h" }
        );

        await logSystemAction("LOGIN_SUCCESS", user.user_id, `Role: ${user.role_name}`, 'INFO', req);

        res.json({
            success: true,
            token,
            role: user.role_name,
            name: user.name,
            user_id: user.user_id,
            department: user.department,
            semester: user.semester
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// =========================
// 2. QR-BASED OPERATIONS
// =========================

// ISSUE Book via QR
app.post('/api/transactions/issue', authenticateToken, requireRole('student'), async (req, res) => {
    const { qr_code } = req.body;
    const studentId = req.user.id;

    if (!qr_code) {
        return res.status(400).json({ success: false, message: "QR Code is required." });
    }

    const cleanQrCode = qr_code.trim();

    try {
        const [student] = await db.query("SELECT status FROM users WHERE user_id = ?", [studentId]);
        if (student.length === 0) {
            return res.status(404).json({ success: false, message: "Student not found." });
        }
        if (student[0].status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: "Account is not active." });
        }

        const [fines] = await db.query(
            "SELECT COALESCE(SUM(fine_amount), 0) as total FROM transactions WHERE student_id = ? AND fine_paid = FALSE AND status = 'RETURNED'",
            [studentId]
        );
        if (fines[0].total > 500) {
            return res.status(403).json({ 
                success: false, 
                message: `You have unpaid fines of PKR ${fines[0].total}. Please clear them first.` 
            });
        }

        const [loans] = await db.query(
            "SELECT COUNT(*) AS count FROM transactions WHERE student_id = ? AND status = 'ISSUED'", 
            [studentId]
        );
        if (loans[0].count >= 3) {
            return res.status(403).json({ success: false, message: "Book limit reached (Max 3 books)." });
        }

        const [books] = await db.query("SELECT * FROM books WHERE qr_code = ?", [cleanQrCode]);
        if (books.length === 0) {
            return res.status(404).json({ success: false, message: "Book not found." });
        }
        if (books[0].availability !== 'AVAILABLE') {
            return res.status(400).json({ success: false, message: "Book is not available." });
        }

        const tid = "TXN-" + Date.now();
        const due = new Date();
        due.setDate(due.getDate() + 7);

        await db.query(
            "INSERT INTO transactions (transaction_id, student_id, book_id, issue_date, due_date, status, issued_by) VALUES (?, ?, ?, CURDATE(), ?, 'ISSUED', ?)",
            [tid, studentId, books[0].book_id, due, req.user.id]
        );
        await db.query(
            "UPDATE books SET availability = 'ISSUED', borrow_count = borrow_count + 1 WHERE book_id = ?",
            [books[0].book_id]
        );
        
        await createNotification(
            studentId,
            'DUE_REMINDER',
            'Book Issued Successfully',
            `You have borrowed "${books[0].title}". Due date: ${due.toDateString()}`
        );

        await logSystemAction("BOOK_ISSUE", studentId, `Issued: ${books[0].title} (TXN: ${tid})`, 'INFO', req);
        res.json({ success: true, message: `Issued: ${books[0].title}`, transaction_id: tid, due_date: due });
    } catch (err) {
        console.error("ISSUE ERROR:", err);
        res.status(500).json({ success: false, message: "Server error during book issue." });
    }
});

// RETURN Book via QR
app.post('/api/transactions/return', authenticateToken, requireRole('student', 'librarian', 'admin'), async (req, res) => {
    const { qr_code } = req.body;

    if (!qr_code) {
        return res.status(400).json({ success: false, message: "QR Code is required." });
    }

    const cleanQrCode = qr_code.trim();

    try {
        const [books] = await db.query("SELECT * FROM books WHERE qr_code = ?", [cleanQrCode]);
        if (books.length === 0) {
            return res.status(404).json({ success: false, message: "Book not found." });
        }

        const [txn] = await db.query(
            "SELECT * FROM transactions WHERE book_id = ? AND status = 'ISSUED' LIMIT 1", 
            [books[0].book_id]
        );
        if (txn.length === 0) {
            return res.status(400).json({ success: false, message: "This book is not currently issued." });
        }

        let fine = 0;
        const today = new Date();
        const dueDate = new Date(txn[0].due_date);
        const diff = today - dueDate;
        
        if (diff > 0) {
            fine = Math.ceil(diff / (1000 * 3600 * 24)) * 50;
        }

        await db.query(
            "UPDATE transactions SET status = 'RETURNED', return_date = CURDATE(), fine_amount = ? WHERE transaction_id = ?",
            [fine, txn[0].transaction_id]
        );
        await db.query(
            "UPDATE books SET availability = 'AVAILABLE' WHERE book_id = ?",
            [books[0].book_id]
        );

        if (fine > 0) {
            await createNotification(
                txn[0].student_id,
                'FINE_ALERT',
                'Fine Applied',
                `You have been fined PKR ${fine} for late return of "${books[0].title}".`
            );
        }

        await logSystemAction(
            "BOOK_RETURN", 
            txn[0].student_id, 
            `Returned: ${books[0].title}. Fine: PKR ${fine}. TXN: ${txn[0].transaction_id}`,
            'INFO',
            req
        );
        
        res.json({ 
            success: true, 
            message: `Book returned successfully. ${fine > 0 ? `Fine: PKR ${fine}` : 'No fine applied.'}`,
            fine_amount: fine 
        });
    } catch (err) {
        console.error("RETURN ERROR:", err);
        res.status(500).json({ success: false, message: "Server error during book return." });
    }
});

// =========================
// 3. BOOK MANAGEMENT APIs
// =========================

// ADD new book
app.post('/api/books', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const { title, author, isbn, department_category, branch_id, qr_code } = req.body;

    if (!title || !author || !isbn || !department_category) {
        return res.status(400).json({ success: false, message: "Title, author, ISBN, and category are required." });
    }

    try {
        let [cat] = await db.query("SELECT category_id FROM categories WHERE category_name = ?", [department_category]);
        let categoryId;
        if (cat.length === 0) {
            const [newCat] = await db.query("INSERT INTO categories (category_name) VALUES (?)", [department_category]);
            categoryId = newCat.insertId;
        } else {
            categoryId = cat[0].category_id;
        }

        const finalQr = qr_code || `QR-${categoryId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const finalBranch = branch_id || 1;

        await db.query(
            "INSERT INTO books (title, author, isbn, qr_code, category_id, branch_id, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [title, author, isbn, finalQr, categoryId, finalBranch, req.user.id]
        );

        await logSystemAction("BOOK_ADDED", req.user.id, `Added: ${title} (ISBN: ${isbn})`, 'INFO', req);
        res.json({ success: true, message: "Book added successfully.", qr_code: finalQr });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: "ISBN or QR code already exists." });
        }
        console.error("ADD BOOK ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to add book." });
    }
});

// UPDATE book
app.put('/api/books/:id', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const bookId = req.params.id;
    const { title, author, isbn, category_id, branch_id, availability } = req.body;

    try {
        const [existing] = await db.query("SELECT * FROM books WHERE book_id = ?", [bookId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Book not found." });
        }

        const updates = [];
        const values = [];
        
        if (title) { updates.push("title = ?"); values.push(title); }
        if (author) { updates.push("author = ?"); values.push(author); }
        if (isbn) { updates.push("isbn = ?"); values.push(isbn); }
        if (category_id) { updates.push("category_id = ?"); values.push(category_id); }
        if (branch_id) { updates.push("branch_id = ?"); values.push(branch_id); }
        if (availability) { updates.push("availability = ?"); values.push(availability); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No fields to update." });
        }

        values.push(bookId);
        await db.query(`UPDATE books SET ${updates.join(", ")} WHERE book_id = ?`, values);

        await logSystemAction("BOOK_UPDATED", req.user.id, `Updated book ID: ${bookId}`, 'INFO', req);
        res.json({ success: true, message: "Book updated successfully." });
    } catch (err) {
        console.error("UPDATE BOOK ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to update book." });
    }
});

// DELETE book
app.delete('/api/books/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const bookId = req.params.id;

    try {
        const [existing] = await db.query("SELECT * FROM books WHERE book_id = ?", [bookId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Book not found." });
        }

        const [issued] = await db.query("SELECT * FROM transactions WHERE book_id = ? AND status = 'ISSUED'", [bookId]);
        if (issued.length > 0) {
            return res.status(400).json({ success: false, message: "Cannot delete: Book is currently issued." });
        }

        await db.query("DELETE FROM books WHERE book_id = ?", [bookId]);
        await logSystemAction("BOOK_DELETED", req.user.id, `Deleted: ${existing[0].title}`, 'INFO', req);
        res.json({ success: true, message: "Book deleted successfully." });
    } catch (err) {
        console.error("DELETE BOOK ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to delete book." });
    }
});

// SEARCH books
app.get('/api/books/search', authenticateToken, async (req, res) => {
    const { query, category, branch, availability } = req.query;
    
    let sql = `
        SELECT b.*, c.category_name, br.branch_name 
        FROM books b
        LEFT JOIN categories c ON b.category_id = c.category_id
        LEFT JOIN branches br ON b.branch_id = br.branch_id
        WHERE 1=1
    `;
    const params = [];

    if (query) {
        sql += " AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR b.qr_code LIKE ?)";
        const likeQuery = `%${query}%`;
        params.push(likeQuery, likeQuery, likeQuery, likeQuery);
    }
    if (category) {
        sql += " AND c.category_name = ?";
        params.push(category);
    }
    if (branch) {
        sql += " AND br.branch_code = ?";
        params.push(branch);
    }
    if (availability) {
        sql += " AND b.availability = ?";
        params.push(availability);
    }

    sql += " ORDER BY b.title ASC";

    try {
        const [books] = await db.query(sql, params);
        res.json({ success: true, count: books.length, books });
    } catch (err) {
        console.error("SEARCH ERROR:", err);
        res.status(500).json({ success: false, message: "Search failed." });
    }
});

// GET all books (with pagination)
app.get('/api/books', authenticateToken, async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const [books] = await db.query(
            `SELECT b.*, c.category_name, br.branch_name 
             FROM books b
             LEFT JOIN categories c ON b.category_id = c.category_id
             LEFT JOIN branches br ON b.branch_id = br.branch_id
             ORDER BY b.title ASC LIMIT ? OFFSET ?`,
            [parseInt(limit), parseInt(offset)]
        );
        
        const [count] = await db.query("SELECT COUNT(*) as total FROM books");
        
        res.json({ 
            success: true, 
            books, 
            pagination: {
                total: count[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(count[0].total / limit)
            }
        });
    } catch (err) {
        console.error("FETCH BOOKS ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to fetch books." });
    }
});

// =========================
// 4. AI RECOMMENDATION ENGINE
// =========================

app.get('/api/recommendations', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { type = 'personalized' } = req.query;

    try {
        let recommendations = [];

        if (type === 'personalized' || type === 'history') {
            const [historyRecs] = await db.query(`
                SELECT DISTINCT b.*, c.category_name, br.branch_name
                FROM books b
                JOIN categories c ON b.category_id = c.category_id
                JOIN branches br ON b.branch_id = br.branch_id
                WHERE b.category_id IN (
                    SELECT DISTINCT b2.category_id 
                    FROM transactions t
                    JOIN books b2 ON t.book_id = b2.book_id
                    WHERE t.student_id = ?
                )
                AND b.availability = 'AVAILABLE'
                AND b.book_id NOT IN (
                    SELECT book_id FROM transactions WHERE student_id = ? AND status = 'ISSUED'
                )
                ORDER BY b.borrow_count DESC
                LIMIT 10
            `, [userId, userId]);
            recommendations = [...recommendations, ...historyRecs];
        }

        if (type === 'department' || type === 'personalized') {
            const [deptRecs] = await db.query(`
                SELECT b.*, c.category_name, br.branch_name
                FROM books b
                JOIN categories c ON b.category_id = c.category_id
                JOIN branches br ON b.branch_id = br.branch_id
                JOIN users u ON u.department = c.category_name
                WHERE u.user_id = ?
                AND b.availability = 'AVAILABLE'
                AND b.book_id NOT IN (
                    SELECT book_id FROM transactions WHERE student_id = ? AND status = 'ISSUED'
                )
                ORDER BY b.borrow_count DESC
                LIMIT 10
            `, [userId, userId]);
            recommendations = [...recommendations, ...deptRecs];
        }

        if (type === 'semester' || type === 'personalized') {
            const [semRecs] = await db.query(`
                SELECT b.*, c.category_name, br.branch_name
                FROM books b
                JOIN categories c ON b.category_id = c.category_id
                JOIN branches br ON b.branch_id = br.branch_id
                WHERE b.availability = 'AVAILABLE'
                AND b.book_id NOT IN (
                    SELECT book_id FROM transactions WHERE student_id = ? AND status = 'ISSUED'
                )
                ORDER BY b.borrow_count DESC
                LIMIT 10
            `, [userId]);
            recommendations = [...recommendations, ...semRecs];
        }

        if (type === 'popular') {
            const [popular] = await db.query(`
                SELECT b.*, c.category_name, br.branch_name
                FROM books b
                JOIN categories c ON b.category_id = c.category_id
                JOIN branches br ON b.branch_id = br.branch_id
                WHERE b.availability = 'AVAILABLE'
                ORDER BY b.borrow_count DESC
                LIMIT 15
            `);
            recommendations = popular;
        }

        const uniqueRecs = Array.from(new Map(recommendations.map(item => [item.book_id, item])).values());

        res.json({ 
            success: true, 
            type,
            count: uniqueRecs.length,
            recommendations: uniqueRecs.slice(0, 15)
        });
    } catch (err) {
        console.error("RECOMMENDATION ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to generate recommendations." });
    }
});

// =========================
// 5. MULTI-BRANCH SUPPORT
// =========================

// GET all branches
app.get('/api/branches', authenticateToken, async (req, res) => {
    try {
        const [branches] = await db.query("SELECT * FROM branches WHERE status = 'ACTIVE'");
        res.json({ success: true, branches });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch branches." });
    }
});

// GET branch-wise inventory
app.get('/api/branches/:id/inventory', authenticateToken, async (req, res) => {
    const branchId = req.params.id;
    
    try {
        const [books] = await db.query(
            `SELECT b.*, c.category_name 
             FROM books b
             LEFT JOIN categories c ON b.category_id = c.category_id
             WHERE b.branch_id = ?`,
            [branchId]
        );
        
        const [stats] = await db.query(
            `SELECT 
                COUNT(*) as total_books,
                SUM(CASE WHEN availability = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
                SUM(CASE WHEN availability = 'ISSUED' THEN 1 ELSE 0 END) as issued
             FROM books WHERE branch_id = ?`,
            [branchId]
        );
        
        res.json({ success: true, stats: stats[0], books });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch branch inventory." });
    }
});

// TRANSFER book between branches
app.post('/api/books/transfer', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const { book_id, to_branch_id } = req.body;

    if (!book_id || !to_branch_id) {
        return res.status(400).json({ success: false, message: "Book ID and target branch ID are required." });
    }

    try {
        const [book] = await db.query("SELECT * FROM books WHERE book_id = ?", [book_id]);
        if (book.length === 0) {
            return res.status(404).json({ success: false, message: "Book not found." });
        }
        if (book[0].availability === 'ISSUED') {
            return res.status(400).json({ success: false, message: "Cannot transfer: Book is currently issued." });
        }
        if (book[0].branch_id == to_branch_id) {
            return res.status(400).json({ success: false, message: "Book is already in this branch." });
        }

        const fromBranchId = book[0].branch_id;

        await db.query(
            "INSERT INTO book_transfers (book_id, from_branch_id, to_branch_id, transferred_by, status) VALUES (?, ?, ?, ?, 'PENDING')",
            [book_id, fromBranchId, to_branch_id, req.user.id]
        );
        
        await db.query("UPDATE books SET availability = 'TRANSFERRED' WHERE book_id = ?", [book_id]);

        await logSystemAction("BOOK_TRANSFER_INIT", req.user.id, 
            `Initiated transfer of "${book[0].title}" from branch ${fromBranchId} to ${to_branch_id}`, 'INFO', req);
        
        res.json({ success: true, message: "Transfer initiated successfully." });
    } catch (err) {
        console.error("TRANSFER ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to initiate transfer." });
    }
});

// COMPLETE transfer
app.post('/api/books/transfer/:id/complete', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const transferId = req.params.id;

    try {
        const [transfer] = await db.query("SELECT * FROM book_transfers WHERE transfer_id = ?", [transferId]);
        if (transfer.length === 0) {
            return res.status(404).json({ success: false, message: "Transfer not found." });
        }

        await db.query(
            "UPDATE books SET branch_id = ?, availability = 'AVAILABLE' WHERE book_id = ?",
            [transfer[0].to_branch_id, transfer[0].book_id]
        );
        await db.query(
            "UPDATE book_transfers SET status = 'COMPLETED', completed_date = NOW() WHERE transfer_id = ?",
            [transferId]
        );

        await logSystemAction("BOOK_TRANSFER_COMPLETE", req.user.id, 
            `Completed transfer ID: ${transferId}`, 'INFO', req);
        
        res.json({ success: true, message: "Transfer completed successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to complete transfer." });
    }
});

// =========================
// 6. ANALYTICS DASHBOARD
// =========================

app.get('/api/analytics/dashboard', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    try {
        const [issued] = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status = 'ISSUED'");
        const [def] = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status = 'ISSUED' AND due_date < CURDATE()");
        const [returnedFines] = await db.query("SELECT COALESCE(SUM(fine_amount), 0) as c FROM transactions WHERE status = 'RETURNED'");
        const [liveFines] = await db.query(`
            SELECT COALESCE(SUM(GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50), 0) as c
            FROM transactions WHERE status = 'ISSUED' AND due_date < CURDATE()
        `);
        const [inventory] = await db.query("SELECT COUNT(*) as c FROM books WHERE availability = 'AVAILABLE'");
        const [totalBooks] = await db.query("SELECT COUNT(*) as c FROM books");

        const [activeStudents] = await db.query(`
            SELECT u.user_id, u.name, u.department, COUNT(t.transaction_id) as borrow_count
            FROM users u
            JOIN transactions t ON u.user_id = t.student_id
            WHERE t.status = 'RETURNED'
            GROUP BY u.user_id
            ORDER BY borrow_count DESC
            LIMIT 10
        `);

        const [popularBooks] = await db.query(`
            SELECT title, author, borrow_count 
            FROM books 
            ORDER BY borrow_count DESC 
            LIMIT 10
        `);

        const [peakTimings] = await db.query(`
            SELECT HOUR(created_at) as hour, COUNT(*) as count
            FROM transactions
            WHERE issue_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY HOUR(created_at)
            ORDER BY count DESC
            LIMIT 5
        `);

        const [deptStats] = await db.query(`
            SELECT 
                u.department,
                COUNT(DISTINCT u.user_id) as total_students,
                COUNT(t.transaction_id) as total_transactions,
                SUM(CASE WHEN t.status = 'ISSUED' THEN 1 ELSE 0 END) as active_loans
            FROM users u
            LEFT JOIN transactions t ON u.user_id = t.student_id
            WHERE u.role_id = 1
            GROUP BY u.department
        `);

        const [monthlySummary] = await db.query(`
            SELECT 
                DATE_FORMAT(issue_date, '%Y-%m') as month,
                COUNT(*) as issues,
                SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) as returns,
                COALESCE(SUM(fine_amount), 0) as total_fines
            FROM transactions
            WHERE issue_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(issue_date, '%Y-%m')
            ORDER BY month DESC
        `);

        const [fineTrends] = await db.query(`
            SELECT 
                DATE_FORMAT(return_date, '%Y-%m') as month,
                COALESCE(SUM(fine_amount), 0) as total_fines,
                COUNT(CASE WHEN fine_amount > 0 THEN 1 END) as fined_transactions
            FROM transactions
            WHERE return_date IS NOT NULL
            AND return_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(return_date, '%Y-%m')
            ORDER BY month DESC
        `);

        const [defaultersList] = await db.query(`
            SELECT DISTINCT u.user_id, u.name, u.department, u.semester,
                COUNT(t.transaction_id) as overdue_count,
                SUM(GREATEST(DATEDIFF(CURDATE(), t.due_date), 0) * 50) as total_fine
            FROM users u
            INNER JOIN transactions t ON u.user_id = t.student_id
            WHERE t.status = 'ISSUED' AND t.due_date < CURDATE()
            GROUP BY u.user_id
            ORDER BY total_fine DESC
        `);

        const [logs] = await db.query("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 20");

        res.json({
            success: true,
            metrics: {
                total_issued: issued[0].c,
                active_defaulters: def[0].c,
                total_fines: parseFloat(returnedFines[0].c) + parseFloat(liveFines[0].c),
                available_inventory: inventory[0].c,
                total_books: totalBooks[0].c
            },
            most_active_students: activeStudents,
            popular_books: popularBooks,
            peak_timings: peakTimings,
            department_statistics: deptStats,
            monthly_summary: monthlySummary,
            fine_trends: fineTrends,
            defaulters_list: defaultersList,
            recent_logs: logs
        });
    } catch (err) {
        console.error("ANALYTICS ERROR:", err);
        res.status(500).json({ success: false, message: "Analytics error." });
    }
});

// =========================
// 7. USER MANAGEMENT APIs
// =========================

// GET all users (Admin only)
app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT u.user_id, u.name, u.email, u.department, u.semester, u.status, 
                   u.failed_login_attempts, u.last_login, r.role_name
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch users." });
    }
});

// UPDATE user status
app.put('/api/users/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    const { status } = req.body;
    const userId = req.params.id;

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status." });
    }

    try {
        await db.query("UPDATE users SET status = ? WHERE user_id = ?", [status, userId]);
        await logSystemAction("USER_STATUS_CHANGED", req.user.id, 
            `Changed ${userId} status to ${status}`, 'INFO', req);
        res.json({ success: true, message: `User status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to update user status." });
    }
});

// =========================
// 8. NOTIFICATIONS
// =========================

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const [notifications] = await db.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            [req.user.id]
        );
        
        const [unreadCount] = await db.query(
            "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE",
            [req.user.id]
        );
        
        res.json({ success: true, notifications, unread_count: unreadCount[0].count });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch notifications." });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.query(
            "UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?",
            [req.params.id, req.user.id]
        );
        res.json({ success: true, message: "Notification marked as read." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to update notification." });
    }
});

// =========================
// 9. FINE MANAGEMENT
// =========================

// GET student fines
app.get('/api/fines', authenticateToken, async (req, res) => {
    const userId = req.user.role === 'student' ? req.user.id : req.query.student_id;

    try {
        const [returnedFines] = await db.query(
            "SELECT * FROM transactions WHERE student_id = ? AND fine_amount > 0 AND fine_paid = FALSE AND status = 'RETURNED'",
            [userId]
        );
        
        const [overdueFines] = await db.query(`
            SELECT *, GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50 as calculated_fine
            FROM transactions
            WHERE student_id = ? AND status = 'ISSUED' AND due_date < CURDATE()
        `, [userId]);
        
        const [payments] = await db.query(
            "SELECT * FROM fine_payments WHERE student_id = ? ORDER BY paid_at DESC",
            [userId]
        );
        
        res.json({ 
            success: true, 
            returned_fines: returnedFines,
            overdue_fines: overdueFines,
            payment_history: payments
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch fines." });
    }
});

// PAY fine (Admin/Librarian only)
app.post('/api/fines/pay', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const { student_id, transaction_id, amount, payment_method = 'CASH' } = req.body;

    if (!student_id || !transaction_id || !amount) {
        return res.status(400).json({ success: false, message: "Student ID, transaction ID, and amount are required." });
    }

    try {
        await db.query("START TRANSACTION");
        
        await db.query(
            "UPDATE transactions SET fine_paid = TRUE, paid_at = NOW() WHERE transaction_id = ?",
            [transaction_id]
        );
        
        await db.query(
            "INSERT INTO fine_payments (student_id, transaction_id, amount, payment_method, processed_by) VALUES (?, ?, ?, ?, ?)",
            [student_id, transaction_id, amount, payment_method, req.user.id]
        );
        
        await db.query("COMMIT");
        
        await createNotification(
            student_id,
            'FINE_ALERT',
            'Fine Paid',
            `Your fine of PKR ${amount} has been paid successfully.`
        );
        
        await logSystemAction("FINE_PAID", req.user.id, 
            `Processed fine payment of PKR ${amount} for ${student_id}`, 'INFO', req);
        
        res.json({ success: true, message: `Fine of PKR ${amount} paid successfully.` });
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("FINE PAYMENT ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to process fine payment." });
    }
});

// CLEAR fine (Admin only - forgiveness)
app.post('/api/admin/clear-fine', authenticateToken, requireRole('admin'), async (req, res) => {
    const { student_id } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: "student_id is required." });
    }
    try {
        await db.query("UPDATE transactions SET fine_amount = 0, fine_paid = TRUE WHERE student_id = ? AND fine_amount > 0", [student_id]);
        await db.query("UPDATE transactions SET due_date = DATE_ADD(CURDATE(), INTERVAL 7 DAY) WHERE student_id = ? AND status = 'ISSUED'", [student_id]);

        await logSystemAction("FINE_CLEARED", req.user.id, `Admin cleared all fines for student ${student_id}`, 'INFO', req);
        res.json({ success: true, message: `All fines cleared for student ${student_id}.` });
    } catch (err) {
        console.error("CLEAR FINE ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to clear fine." });
    }
});

// =========================
// 10. BACKUP & ARCHIVAL
// =========================

// Trigger manual backup (Admin only)
app.post('/api/admin/backup', authenticateToken, requireRole('admin'), async (req, res) => {
    const { backup_type = 'MANUAL' } = req.body;
    
    try {
        const backupPath = `/backups/ssuet_library_${Date.now()}.sql`;
        
        await db.query(
            "INSERT INTO backup_logs (backup_type, file_path, status) VALUES (?, ?, 'SUCCESS')",
            [backup_type, backupPath]
        );
        
        await logSystemAction("BACKUP_CREATED", req.user.id, 
            `Manual backup created: ${backupPath}`, 'INFO', req);
        
        res.json({ success: true, message: "Backup initiated successfully.", path: backupPath });
    } catch (err) {
        await db.query(
            "INSERT INTO backup_logs (backup_type, status, error_message) VALUES (?, 'FAILED', ?)",
            [backup_type, err.message]
        );
        res.status(500).json({ success: false, message: "Backup failed." });
    }
});

// GET backup history
app.get('/api/admin/backups', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const [backups] = await db.query("SELECT * FROM backup_logs ORDER BY created_at DESC");
        res.json({ success: true, backups });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch backup history." });
    }
});

// ARCHIVE old transactions (Admin only)
app.post('/api/admin/archive', authenticateToken, requireRole('admin'), async (req, res) => {
    const { months = 12 } = req.body;
    
    try {
        await db.query("START TRANSACTION");
        
        await db.query(`
            INSERT INTO archived_transactions 
            (original_transaction_id, student_id, book_id, issue_date, return_date, fine_amount)
            SELECT transaction_id, student_id, book_id, issue_date, return_date, fine_amount
            FROM transactions
            WHERE status = 'RETURNED' 
            AND return_date < DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        `, [months]);
        
        await db.query(`
            DELETE FROM transactions 
            WHERE status = 'RETURNED' 
            AND return_date < DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        `, [months]);
        
        await db.query("COMMIT");
        
        await logSystemAction("DATA_ARCHIVED", req.user.id, 
            `Archived transactions older than ${months} months`, 'INFO', req);
        
        res.json({ success: true, message: `Transactions older than ${months} months archived successfully.` });
    } catch (err) {
        await db.query("ROLLBACK");
        res.status(500).json({ success: false, message: "Archival failed." });
    }
});

// =========================
// 11. LOGGING APIs
// =========================

app.get('/api/admin/logs', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    const { type, severity, start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = "SELECT * FROM activity_logs WHERE 1=1";
    const params = [];
    
    if (type) {
        sql += " AND action_type = ?";
        params.push(type);
    }
    if (severity) {
        sql += " AND severity = ?";
        params.push(severity);
    }
    if (start_date) {
        sql += " AND timestamp >= ?";
        params.push(start_date);
    }
    if (end_date) {
        sql += " AND timestamp <= ?";
        params.push(end_date);
    }
    
    sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));
    
    try {
        const [logs] = await db.query(sql, params);
        const [count] = await db.query("SELECT COUNT(*) as total FROM activity_logs");
        
        res.json({ 
            success: true, 
            logs,
            pagination: {
                total: count[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch logs." });
    }
});

// Failed login attempts report
app.get('/api/admin/security/failed-logins', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const [failedLogins] = await db.query(`
            SELECT fl.*, u.name, u.status
            FROM failed_logins fl
            LEFT JOIN users u ON fl.username_attempted = u.user_id
            ORDER BY fl.timestamp DESC
            LIMIT 100
        `);
        
        const [summary] = await db.query(`
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as attempts,
                COUNT(DISTINCT username_attempted) as unique_users
            FROM failed_logins
            WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `);
        
        res.json({ success: true, failed_logins: failedLogins, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch security report." });
    }
});

// =========================
// 12. STUDENT DASHBOARD
// =========================

app.get('/api/student/dashboard', authenticateToken, requireRole('student'), async (req, res) => {
    const userId = req.user.id;

    try {
        const [loans] = await db.query(
            `SELECT t.*, b.title, b.author, b.qr_code 
             FROM transactions t 
             JOIN books b ON t.book_id = b.book_id 
             WHERE t.student_id = ? AND t.status = 'ISSUED'`,
            [userId]
        );

        const [returnedFine] = await db.query(
            "SELECT COALESCE(SUM(fine_amount), 0) as total FROM transactions WHERE student_id = ? AND status = 'RETURNED' AND fine_paid = FALSE",
            [userId]
        );

        const [overdueFine] = await db.query(`
            SELECT COALESCE(SUM(GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50), 0) as total
            FROM transactions
            WHERE student_id = ? AND status = 'ISSUED' AND due_date < CURDATE()
        `, [userId]);

        const unpaid_balance = parseFloat(returnedFine[0].total) + parseFloat(overdueFine[0].total);

        const [recs] = await db.query(`
            SELECT b.*, c.category_name
            FROM books b
            JOIN categories c ON b.category_id = c.category_id
            WHERE b.availability = 'AVAILABLE'
            AND b.category_id IN (
                SELECT DISTINCT b2.category_id 
                FROM transactions t
                JOIN books b2 ON t.book_id = b2.book_id
                WHERE t.student_id = ?
            )
            AND b.book_id NOT IN (
                SELECT book_id FROM transactions WHERE student_id = ? AND status = 'ISSUED'
            )
            ORDER BY b.borrow_count DESC
            LIMIT 10
        `, [userId, userId]);

        const [notifications] = await db.query(
            "SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC LIMIT 5",
            [userId]
        );

        res.json({
            success: true,
            active_loans: loans,
            unpaid_balance,
            recommendations: recs,
            notifications
        });
    } catch (err) {
        console.error("STUDENT DASHBOARD ERROR:", err);
        res.status(500).json({ success: false, message: "Dashboard error." });
    }
});

// =========================
// 13. ADMIN METRICS (Legacy)
// =========================

app.get('/api/admin/metrics', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    try {
        const [issued] = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status = 'ISSUED'");
        const [def] = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status = 'ISSUED' AND due_date < CURDATE()");
        const [returnedFines] = await db.query("SELECT COALESCE(SUM(fine_amount), 0) as c FROM transactions WHERE status = 'RETURNED'");
        const [liveFines] = await db.query(`
            SELECT COALESCE(SUM(GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50), 0) as c
            FROM transactions WHERE status = 'ISSUED' AND due_date < CURDATE()
        `);
        const [inventory] = await db.query("SELECT COUNT(*) as c FROM books WHERE availability = 'AVAILABLE'");
        const [daily] = await db.query(`
            SELECT COUNT(*) as c FROM transactions 
            WHERE DATE(issue_date) = CURDATE() OR DATE(return_date) = CURDATE()
        `);
        const [mostBorrowed] = await db.query(`
            SELECT title, borrow_count FROM books ORDER BY borrow_count DESC LIMIT 5
        `);
        const [defaultersList] = await db.query(`
            SELECT DISTINCT u.user_id, u.name, u.department, u.semester
            FROM users u
            INNER JOIN transactions t ON u.user_id = t.student_id
            WHERE t.status = 'ISSUED' AND t.due_date < CURDATE()
            ORDER BY u.name ASC
        `);
        const [logs] = await db.query("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 10");

        res.json({
            success: true,
            total_issued: issued[0].c,
            active_defaulters: def[0].c,
            fine_stats: parseFloat(returnedFines[0].c) + parseFloat(liveFines[0].c),
            active_inventory: inventory[0].c,
            daily_transactions: daily[0].c,
            most_borrowed: mostBorrowed,
            defaulters_list: defaultersList,
            logs
        });
    } catch (err) {
        console.error("METRICS ERROR:", err);
        res.status(500).json({ success: false, message: "Analytics error." });
    }
});

// =========================
// 14. ADMIN BOOKS INVENTORY
// =========================

app.get('/api/admin/books', authenticateToken, requireRole('admin', 'librarian'), async (req, res) => {
    try {
        const [books] = await db.query(`
            SELECT b.book_id, b.title, b.author, c.category_name as department_category, 
                   b.qr_code, b.availability, b.borrow_count, br.branch_name
            FROM books b
            LEFT JOIN categories c ON b.category_id = c.category_id
            LEFT JOIN branches br ON b.branch_id = br.branch_id
            ORDER BY b.title ASC
        `);
        res.json({ success: true, books });
    } catch (err) {
        console.error("INVENTORY ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to fetch books inventory." });
    }
});

// =========================
// HEALTH CHECK
// =========================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'SSUET Library API' });
});

// =========================
// ERROR HANDLING
// =========================
app.use((err, req, res, next) => {
    console.error("UNHANDLED ERROR:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
});

// =========================
// SERVER START
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 SSUET Library Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});