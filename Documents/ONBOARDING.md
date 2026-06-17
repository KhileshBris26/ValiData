# 🚀 ValiData: New Developer Onboarding

Welcome to the team! This guide will get you from `git clone` to a running development environment in less than 10 minutes.

---

## 🛠️ Step 1: Clone the Repository
```powershell
git clone https://github.com/KhileshBris26/ValiData.git
cd ValiData
```

---

## 🐍 Step 2: Backend Setup (Python)
1. **Create and Activate Virtual Environment**:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. **Install Dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```
3. **Run the API**:
   ```powershell
   uvicorn main:app --reload --port 8000
   ```
   *The backend will automatically create a local `users.db` for you. No initial configuration is required.*

---

## ⚛️ Step 3: Frontend Setup (React)
1. **Open a new terminal** and navigate to the frontend folder:
   ```powershell
   cd frontend
   ```
2. **Install Packages**:
   ```powershell
   npm install
   ```
3. **Launch Dev Server**:
   ```powershell
   npm run dev
   ```
4. **Open Browser**: Go to [http://localhost:5173](http://localhost:5173).

---

## 🧪 Step 4: Your First Login & Test
1. **Register**: Since you are running a local database, click **"Register"** on the login page and create any account.
2. **Connection Vault**: Once logged in, go to the **Connection Vault** tab.
3. **Connect**: Enter your Snowflake or Databricks credentials. 
   *Note: These are saved in your browser's session storage only. They will NOT be shared with other developers.*
4. **Validate**: Go to the **Data Catalog**, select a table, and click **"Profile and Evaluate"** to verify data is flowing.

---

## 🌿 Step 5: Development Workflow
- **Branching**: Never work directly on `main`. Create a feature branch:
  ```powershell
  git checkout -b feat/your-feature-name
  ```
- **Pushing**: When ready, push your branch. Vercel will automatically generate a **Preview URL** for you to share with the team for review.

---

## 📖 Further Reading
For a deep dive into the architecture, SQL engines, and AI Agent logic, refer to the [PROJECT_GUIDE.md](./PROJECT_GUIDE.md) in the root directory.

*Happy Coding!* 🦅
