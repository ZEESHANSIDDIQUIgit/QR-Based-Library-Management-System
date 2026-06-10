# 📚 QR-Based Smart Library Management System (LMS)

A secure, full-stack library management system featuring QR-code self-issue/return pipelines, live web-camera scanning, an automated student ledger, and an administrative analytics panel. Built with Node.js, Express, MySQL, and Tailwind CSS.

---

## 🚀 Key Feature Set

### 1. 🔑 Secure Authentication & Middlewares
- **JWT Session Validation:** Uses JSON Web Tokens (JWT) to secure user requests, managing distinct student and librarian role hierarchies.
- **Log Auditing:** Automatically logs system actions (like book issues or returns) to keep a secure history of activities.

### 2. 📸 QR-Code Circulation Module
- **Live Webcam Scanning:** Uses the HTML5-QRCode library for fast camera decoding directly within the browser interface.
- **Image Upload Decoding:** Supports local file-upload scanning as an alternative for low-resolution or fixed-focus webcams.
- **Data Sanitization:** Implements backend trimming to clean trailing whitespaces and newline characters from scanned code strings, preventing database mismatches.
- **Keyboard Fallback:** Features manual input verification if physical camera scanning is unavailable.

### 3. 📊 Interactive Student Dashboard
- **Active Allocations Ledger:** Tracks active transaction IDs, check-out dates, and return due dates dynamically.
- **Fine Management:** Automatically calculates overdue fines based on due dates and updates account balances.
- **AI Recommender Module:** Lists personalized academic recommendations. It features:
  - **Dynamic Filtering:** Automatically filters out books that are currently issued to the logged-in student.
  - **Infinite Auto-Scroll:** An automated vertical scroll-loop that pauses when hovered over for easier readability.

### 4. 📈 Admin Analytics Terminal
- **Core Library Statistics:** Real-time counters showing total checked-out books, active defaulters, and total unpaid fines.
- **Daily Auditing:** Tracks daily issue and return counts.
- **Defaulters Audit:** Generates active lists of students with overdue books with complete contact and class details.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express, MySQL, `jsonwebtoken`, `cors`
- **Frontend:** HTML5, CSS3, Tailwind CSS, HTML5-QRCode library

---

## 📁 Database Schema Reference

The system relies on five main relational database tables in MySQL:

1. **`librarians`**: Stores admin credentials, names, and access IDs.
2. **`students`**: Stores student IDs, names, email, department, semester, and account status (`ACTIVE` or `BLOCKED`).
3. **`books`**: Stores catalog items, including titles, authors, categories, unique QR codes, availability, and borrow counts.
4. **`transactions`**: Stores transaction records, linking students to books with issue dates, due dates, return dates, and fine amounts.
5. **`activity_logs`**: Stores system action audits.

---

## ⚙️ Installation & Local Setup

### 1. Clone & Navigate
```bash
git clone <your-repository-url>
cd QR-LIBRARY