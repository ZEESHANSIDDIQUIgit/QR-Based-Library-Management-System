# 📚 SSUET QR-Based Smart Library Management System

A secure, full-stack library management system featuring QR-code self-issue/return pipelines, live web-camera scanning, an automated student ledger, AI-powered book recommendations, multi-branch inventory management, and a comprehensive administrative analytics panel. Built with Node.js, Express, MySQL, and Tailwind CSS.

---

## 🚀 Key Feature Set

### 1. 🔑 Secure Authentication & Role-Based Access Control (RBAC)
- **JWT Session Validation:** Uses JSON Web Tokens (JWT) to secure all API endpoints.
- **Unified User Management:** Single `users` table with role-based access (Student, Librarian, Admin).
- **Account Security:** Failed login tracking, automatic account suspension after 5 attempts.
- **Log Auditing:** Comprehensive activity logs with IP tracking and severity levels.

### 2. 📸 QR-Code Circulation Module
- **Live Webcam Scanning:** Uses the HTML5-QRCode library for fast camera decoding.
- **Image Upload Decoding:** Supports local file-upload scanning as an alternative.
- **Data Sanitization:** Backend trimming to clean QR code strings.
- **Keyboard Fallback:** Manual input verification if camera is unavailable.

### 3. 📊 Interactive Student Dashboard
- **Active Loans Ledger:** Real-time tracking of issued books with due dates.
- **Fine Management:** Automatic overdue fine calculation (PKR 50/day).
- **Payment History:** Track all fine payments and outstanding balances.
- **AI Recommender Module:** Personalized book recommendations based on:
  - Borrowing history
  - Department/semester matching
  - Popular books in the library
- **Infinite Auto-Scroll:** Automated recommendation carousel with hover pause.

### 4. 📈 Admin Analytics Terminal
- **Real-Time Metrics:** Total issued books, active defaulters, aggregated fines, inventory stock.
- **Visual Analytics:** Chart.js integration for:
  - Department statistics (bar charts)
  - Monthly issue/return trends (line charts)
  - Fine trends over time
  - Most active students leaderboard
- **Defaulters Directory:** Active listing of overdue students with fine clearing.
- **System Audit Trail:** Live database activity logs with severity indicators.

### 5. 🏢 Multi-Branch Support
- **Branch Management:** Multiple library locations with separate inventories.
- **Book Transfers:** Inter-branch book transfer workflow with status tracking.

### 6. 💰 Fine & Payment System
- **Automatic Fine Calculation:** PKR 50 per overdue day.
- **Fine Payments:** Cash/online payment processing by librarians.
- **Fine Forgiveness:** Admin can clear student fines.

### 7. 🛡️ Security & Backup
- **Failed Login Monitoring:** Tracks and displays brute force attempts.
- **Database Backup:** Manual backup trigger with history logging.
- **Data Archival:** Archive old transactions to improve performance.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js, Express.js, MySQL, JWT, bcrypt, CORS |
| **Frontend** | HTML5, CSS3, Tailwind CSS, Chart.js, HTML5-QRCode |
| **Database** | MySQL 8.0 with relational schema |

---

## 📁 Database Schema Reference

The system uses a normalized relational schema with 15+ tables:

| Table | Purpose |
|-------|---------|
| `roles` | User role definitions (student, librarian, admin) |
| `users` | Unified user accounts with RBAC |
| `branches` | Library branch locations |
| `categories` | Book subject categories |
| `books` | Inventory with QR codes and availability |
| `book_transfers` | Inter-branch transfer tracking |
| `transactions` | Issue/return records with fine tracking |
| `fine_payments` | Payment processing history |
| `activity_logs` | System audit trail |
| `failed_logins` | Security monitoring |
| `notifications` | User alerts and reminders |
| `backup_logs` | Backup operation history |
| `archived_transactions` | Historical data storage |

---

## ⚙️ Installation & Local Setup

### Prerequisites
- Node.js (v16+)
- MySQL 8.0+
- npm or yarn

### 1. Clone & Navigate
```bash
git clone https://github.com/ZEESHANSIDDIQUIgit/QR-Based-Library-Management-System.git
cd QR-Based-Library-Management-System
