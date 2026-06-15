const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');
 
const app = express();
 
// 1. UNIFIED DYNAMIC CORS CONFIGURATION
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowed = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500'
        ];
        if (allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());
 
const JWT_SECRET = "SSUET_SECRET_KEY_2026";
 
/* =========================
   ACTIVITY LOGGING
========================= */
async function logSystemAction(action, uid, details) {
    try {
        await db.query(
            "INSERT INTO activity_logs (action_type, user_id, details) VALUES (?, ?, ?)",
            [action, uid, details]
        );
    } catch (err) {
        console.error("LOG ERROR:", err.message);
    }
}
 
/* =========================
   AUTH MIDDLEWARES
========================= */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ success: false, message: "No token provided." });
 
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ success: false, message: "Invalid session." });
        req.user = user;
        next();
    });
}
 
function requireLibrarian(req, res, next) {
    if (!req.user || req.user.role !== 'librarian') {
        return res.status(403).json({ success: false, message: "Librarian role required." });
    }
    next();
}
 
/* =========================
   LOGIN
========================= */
app.post('/api/auth/login', async (req, res) => {
    const { student_id, admin_id, password, role } = req.body;
    try {
        if (role === 'admin') {
            const finalId = admin_id || student_id;
            const [rows] = await db.query("SELECT * FROM librarians WHERE admin_id = ?", [finalId]);
            if (rows.length === 0 || password !== rows[0].password) {
                return res.json({ success: false, message: "Invalid Admin Credentials." });
            }
            const token = jwt.sign({ id: rows[0].admin_id, role: "librarian" }, JWT_SECRET, { expiresIn: "2h" });
            return res.json({ success: true, token, adminToken: token, role: "librarian", name: rows[0].name });
        }
 
        const [rows] = await db.query("SELECT * FROM students WHERE student_id = ?", [student_id]);
        if (rows.length === 0 || password !== rows[0].password) {
            return res.json({ success: false, message: "Invalid Student Credentials." });
        }
        if (rows[0].status !== 'ACTIVE') return res.json({ success: false, message: "Account Inactive." });
 
        const token = jwt.sign({ id: rows[0].student_id, role: "student" }, JWT_SECRET, { expiresIn: "2h" });
        res.json({ success: true, token, role: "student", name: rows[0].name, student_id: rows[0].student_id });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
 
/* =========================
   REGISTER
========================= */
app.post('/api/auth/register', async (req, res) => {
    const { student_id, name, email, password, department, semester } = req.body;
 
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(name)) {
        return res.json({ success: false, message: "Name must contain only alphabets." });
    }
 
    const idRegex = /^\d{4}[FS]-[A-Z]{2,5}-\d{3,}$/;
    const formattedId = student_id.toUpperCase();
    if (!idRegex.test(formattedId)) {
        return res.json({ success: false, message: "Invalid ID format. Required: 2024F-BCS-005" });
    }
 
    if (!email.toLowerCase().endsWith('@ssuet.edu.pk')) {
        return res.json({ success: false, message: "Official @ssuet.edu.pk email required." });
    }
 
    if (password.length < 6) {
        return res.json({ success: false, message: "Password must be at least 6 characters." });
    }
 
    try {
        await db.query(
            `INSERT INTO students (student_id, name, email, password, department, semester, status)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [formattedId, name, email.toLowerCase(), password, department, semester]
        );
        res.json({ success: true, message: "Registration successful." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.json({ success: false, message: "Student ID or Email already exists." });
        }
        console.error("REGISTRATION ERROR:", err);
        res.status(500).json({ success: false, message: "Database error." });
    }
});
 
/* =========================
   ISSUE / RETURN / DASHBOARD
========================= */
app.post('/api/transactions/issue', authenticateToken, async (req, res) => {
    const { qr_code } = req.body;
    const studentId = req.user.id;

    if (!qr_code) {
        return res.status(400).json({ success: false, message: "QR Code is required." });
    }

    const cleanQrCode = qr_code.trim();

    try {
        const [student] = await db.query("SELECT status FROM students WHERE student_id = ?", [studentId]);
        if (student.length === 0) {
            return res.json({ success: false, message: "Student account context not found." });
        }
        if (student[0].status !== 'ACTIVE') {
            return res.json({ success: false, message: "Account Blocked." });
        }
 
        const [loans] = await db.query("SELECT COUNT(*) AS count FROM transactions WHERE student_id=? AND status='ISSUED'", [studentId]);
        if (loans[0].count >= 3) return res.json({ success: false, message: "Limit reached (Max 3 books)." });
 
        const [books] = await db.query("SELECT * FROM books WHERE qr_code = ?", [cleanQrCode]);
        if (books.length === 0 || books[0].availability === 'ISSUED') {
            return res.json({ success: false, message: "Book unavailable or not found." });
        }
 
        const tid = "TXN-" + Date.now();
        const due = new Date(); 
        due.setDate(due.getDate() + 7);
 
        await db.query("INSERT INTO transactions (transaction_id, student_id, book_id, issue_date, due_date, status) VALUES (?,?,?,CURDATE(),?,'ISSUED')", [tid, studentId, books[0].book_id, due]);
        await db.query("UPDATE books SET availability='ISSUED', borrow_count=borrow_count+1 WHERE book_id=?", [books[0].book_id]);
        await logSystemAction("BOOK_ISSUE", studentId, `Issued: ${books[0].title}`);
        
        res.json({ success: true, message: `Issued: ${books[0].title}` });
    } catch (err) { 
        console.error("ISSUE ERROR:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});
 
app.post('/api/transactions/return', authenticateToken, async (req, res) => {
    const { qr_code } = req.body;

    if (!qr_code) {
        return res.status(400).json({ success: false, message: "QR Code is required." });
    }

    const cleanQrCode = qr_code.trim();

    try {
        const [books] = await db.query("SELECT * FROM books WHERE qr_code=?", [cleanQrCode]);
        if (books.length === 0) return res.json({ success: false, message: "Book not found." });
 
        const [txn] = await db.query("SELECT * FROM transactions WHERE book_id=? AND status='ISSUED' LIMIT 1", [books[0].book_id]);
        if (txn.length === 0) return res.json({ success: false, message: "Not issued." });
 
        let fine = 0;
        const diff = new Date() - new Date(txn[0].due_date);
        if (diff > 0) fine = Math.ceil(diff / (1000*3600*24)) * 50;
 
        await db.query("UPDATE transactions SET status='RETURNED', return_date=CURDATE(), fine_amount=? WHERE transaction_id=?", [fine, txn[0].transaction_id]);
        await db.query("UPDATE books SET availability='AVAILABLE' WHERE book_id=?", [books[0].book_id]);
        await logSystemAction("BOOK_RETURN", txn[0].student_id, `Returned: ${books[0].title}. Fine: PKR ${fine}`);
        
        res.json({ success: true, message: `Returned. Fine: PKR ${fine}` });
    } catch (err) { 
        console.error("RETURN ERROR:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});
 
app.get('/api/transactions/active', authenticateToken, async (req, res) => {
    try {
        const uid = req.user.id;

        const [loans] = await db.query(
            "SELECT t.*, b.title FROM transactions t JOIN books b ON t.book_id=b.book_id WHERE t.student_id=? AND t.status='ISSUED'",
            [uid]
        );

        // Sum fines from already-returned transactions
        const [returnedFine] = await db.query(
            "SELECT COALESCE(SUM(fine_amount), 0) as total FROM transactions WHERE student_id=? AND status='RETURNED'",
            [uid]
        );

        // Calculate live accruing fine on currently overdue issued books (PKR 50/day)
        const [overdueFine] = await db.query(`
            SELECT COALESCE(
                SUM(GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50), 0
            ) as total
            FROM transactions
            WHERE student_id=? AND status='ISSUED' AND due_date < CURDATE()
        `, [uid]);

        const unpaid_balance = parseFloat(returnedFine[0].total) + parseFloat(overdueFine[0].total);

        // Fetch top books for AI recommendations (increased limit for smooth scroll)
        const [recs] = await db.query(
            "SELECT title, author FROM books ORDER BY borrow_count DESC LIMIT 15"
        );
        
        res.json({ success: true, loans, unpaid_balance, recommendations: recs });
    } catch (err) { 
        console.error("ACTIVE TRANSACTIONS ERROR:", err);
        res.status(500).json({ success: false, message: "Dashboard error." }); 
    }
});
 
/* =========================
   ADMIN METRICS
========================= */
app.get('/api/admin/metrics', authenticateToken, requireLibrarian, async (req, res) => {
    try {
        const [issued]    = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status='ISSUED'");
        const [def]       = await db.query("SELECT COUNT(*) as c FROM transactions WHERE status='ISSUED' AND due_date < CURDATE()");

        // Sum returned fines + live accruing overdue fines on active loans
        const [returnedFines] = await db.query("SELECT COALESCE(SUM(fine_amount), 0) as c FROM transactions WHERE status='RETURNED'");
        const [liveFines]     = await db.query(`
            SELECT COALESCE(SUM(GREATEST(DATEDIFF(CURDATE(), due_date), 0) * 50), 0) as c
            FROM transactions WHERE status='ISSUED' AND due_date < CURDATE()
        `);
        const fines = [{ c: parseFloat(returnedFines[0].c) + parseFloat(liveFines[0].c) }];
 
        const [inventory] = await db.query("SELECT COUNT(*) as c FROM books WHERE availability='AVAILABLE'");
 
        const [daily]     = await db.query(`
            SELECT COUNT(*) as c FROM transactions 
            WHERE DATE(issue_date) = CURDATE() OR DATE(return_date) = CURDATE()
        `);
 
        const [mostBorrowed] = await db.query(`
            SELECT title, borrow_count 
            FROM books 
            ORDER BY borrow_count DESC 
            LIMIT 5
        `);
 
        const [defaultersList] = await db.query(`
            SELECT DISTINCT s.student_id, s.name, s.department, s.semester
            FROM students s
            INNER JOIN transactions t ON s.student_id = t.student_id
            WHERE t.status = 'ISSUED' AND t.due_date < CURDATE()
            ORDER BY s.name ASC
        `);
 
        const [logs] = await db.query("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 10");
 
        res.json({
            success: true,
            total_issued:       issued[0].c,
            active_defaulters:  def[0].c,
            fine_stats:         fines[0].c || 0,
            active_inventory:   inventory[0].c,
            daily_transactions: daily[0].c,
            most_borrowed:      mostBorrowed,
            defaulters_list:    defaultersList,
            logs
        });
    } catch (err) {
        console.error("METRICS ERROR:", err);
        res.status(500).json({ success: false, message: "Analytics error." });
    }
});
 
/* =========================
   BOOKS INVENTORY + QR CODES
========================= */
app.get('/api/admin/books', authenticateToken, requireLibrarian, async (req, res) => {
    try {
        const [books] = await db.query(`
            SELECT 
                book_id,
                title,
                author,
                department_category,
                qr_code,
                availability,
                borrow_count
            FROM books
            ORDER BY title ASC
        `);
        res.json({ success: true, books });
    } catch (err) {
        console.error("INVENTORY ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to fetch books inventory." });
    }
});
 
/* =========================
   CLEAR FINE
========================= */
app.post('/api/admin/clear-fine', authenticateToken, requireLibrarian, async (req, res) => {
    const { student_id } = req.body;
    if (!student_id) {
        return res.status(400).json({ success: false, message: "student_id is required." });
    }
    try {
        // Clear stored fines on returned transactions
        await db.query(
            "UPDATE transactions SET fine_amount = 0 WHERE student_id = ? AND fine_amount > 0",
            [student_id]
        );

        // Reset due_date on active issued loans to today + 7 days (wipes live overdue fine)
        await db.query(
            "UPDATE transactions SET due_date = DATE_ADD(CURDATE(), INTERVAL 7 DAY) WHERE student_id = ? AND status = 'ISSUED'",
            [student_id]
        );

        await logSystemAction("FINE_CLEARED", student_id, `Admin cleared all fines for student ${student_id}`);
        res.json({ success: true, message: `Fines cleared for student ${student_id}.` });
    } catch (err) {
        console.error("CLEAR FINE ERROR:", err);
        res.status(500).json({ success: false, message: "Failed to clear fine." });
    }
});

app.listen(5000, () => console.log("🚀 System online on port 5000"));