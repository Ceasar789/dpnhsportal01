# All Roles Routes - Configuration Summary

## 📋 Complete Role Routing Map

### 1. STUDENT Role
```
Login Page:        /student-login
Dashboard Route:   /student-dashboard
Protected By:      ProtectedRoute allowedRoles=['student']
Database Role:     'student'
Login Flow:        /student-login only
```

### 2. TEACHER Role
```
Login Page:        /faculty-login (select "Teacher")
Dashboard Route:   /teacher-dashboard
Protected By:      ProtectedRoute allowedRoles=['teacher']
Database Role:     'teacher'
Auth Metadata:     role='teacher'
```

### 3. FACULTY Role
```
Login Page:        /faculty-login (select "Faculty")
Dashboard Route:   /faculty-dashboard
Protected By:      ProtectedRoute allowedRoles=['faculty']
Database Role:     'faculty'
Auth Metadata:     role='faculty'
```

### 4. REGISTRAR Role
```
Login Page:        /faculty-login (select "Registrar")
Dashboard Route:   /registrar-dashboard
Protected By:      ProtectedRoute allowedRoles=['registrar']
Database Role:     'registrar'
Auth Metadata:     role='registrar'
```

### 5. ADMIN (main_admin) Role
```
Login Page:        /faculty-login (select "Admin")
Dashboard Route:   /admin-dashboard
Protected By:      ProtectedRoute allowedRoles=['main_admin']
Database Role:     'main_admin'
Auth Metadata:     role='main_admin'
Entry Point:       /faculty-login with role='main_admin'
```

---

## 🔐 Role Normalization Logic

The system normalizes roles to handle variations:
```javascript
'admin' → 'main_admin'
'main_admin' → 'main_admin'
'main admin' → 'main_admin'
'Admin' → 'main_admin'
'ADMIN' → 'main_admin'

'teacher' → 'teacher'
'Teacher' → 'teacher'
'TEACHER' → 'teacher'

'faculty' → 'faculty'
'Faculty' → 'faculty'

'registrar' → 'registrar'
'Registrar' → 'registrar'

'student' → 'student'
'Student' → 'student'
```

---

## 🔄 Authentication Flow by Role

### Student Login Flow
```
1. Click /login → "Student" button
2. Go to /student-login
3. Enter email + password
4. AuthContext.login() → Supabase auth
5. Fetch role from profiles table (database priority)
6. Check: role == 'student' ? ✅ YES → Redirect /student-dashboard
                             ? ❌ NO  → Error + Logout
7. ProtectedRoute validates: allowedRoles=['student']
```

### Faculty Portal Login Flow (Teacher/Faculty/Registrar/Admin)
```
1. Click /login → "Faculty" button
2. Go to /faculty-login
3. Select role from dropdown (Teacher/Faculty/Registrar/Admin)
4. Enter email + password
5. AuthContext.login() → Supabase auth
6. Fetch role from profiles table (database priority)
7. Check: role == selectedRole ? ✅ YES → Redirect to dashboard
                               ? ❌ NO  → Error + Logout
8. ProtectedRoute validates: allowedRoles=[selectedRole]
```

---

## ✅ All Routes Verification

### AppRoutes.jsx Configuration
```jsx
// Public Routes
<Route path="/"         element={<Home />} />
<Route path="/news"     element={<News />} />
<Route path="/calendar" element={<Calendar />} />
<Route path="/login"    element={<Login />} />

// Auth Routes
<Route path="/student-login"   element={<StudentLogin />} />
<Route path="/faculty-login"   element={<FacultyLogin />} />

// Protected Routes
<Route path="/student-dashboard/*" 
  element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />

<Route path="/teacher-dashboard/*" 
  element={<ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>} />

<Route path="/faculty-dashboard/*" 
  element={<ProtectedRoute allowedRoles={['faculty']}><FacultyDashboard /></ProtectedRoute>} />

<Route path="/registrar-dashboard/*" 
  element={<ProtectedRoute allowedRoles={['registrar']}><RegistrarDashboard /></ProtectedRoute>} />

<Route path="/admin-dashboard/*" 
  element={<ProtectedRoute allowedRoles={['main_admin']}><AdminDashboard /></ProtectedRoute>} />
```

### FacultyLogin.jsx Role Options
```jsx
const ROLE_OPTIONS = [
  { value: 'main_admin', label: 'Admin',      color: '#dc3545', route: '/admin-dashboard' },
  { value: 'teacher',    label: 'Teacher',    color: '#0d2b5c', route: '/teacher-dashboard' },
  { value: 'faculty',    label: 'Faculty',    color: '#6f42c1', route: '/faculty-dashboard' },
  { value: 'registrar',  label: 'Registrar',  color: '#198754', route: '/registrar-dashboard' },
];
```

### ProtectedRoute.jsx Role Mapping
```jsx
const roleRoutes = {
  student: '/student-dashboard',
  teacher: '/teacher-dashboard',
  faculty: '/faculty-dashboard',
  registrar: '/registrar-dashboard',
  main_admin: '/admin-dashboard'
};
```

---

## 🛡️ Security Validations

### 3-Layer Defense System

**Layer 1: Login Page Validation**
```
StudentLogin:    Only allows role='student'
FacultyLogin:    Allows role='teacher'|'faculty'|'registrar'|'main_admin'
                 Rejects role='student'
```

**Layer 2: ProtectedRoute Validation**
```
Each route checks: allowedRoles.includes(normalizedRole)
Mismatched roles → Redirect to correct dashboard
```

**Layer 3: Dashboard-Level Validation**
```
Each dashboard component can add additional checks
(Optional) isStudent(), isTeacher(), etc.
```

---

## 📊 Test Credentials Template

Use this template to create test users for each role:

```sql
-- Student
INSERT INTO profiles (id, email, name, role, status) 
VALUES ('uuid', 'student@dpnhs.edu.ph', 'Test Student', 'student', 'active');

-- Teacher  
INSERT INTO profiles (id, email, name, role, status)
VALUES ('uuid', 'teacher@dpnhs.edu.ph', 'Test Teacher', 'teacher', 'active');

-- Faculty
INSERT INTO profiles (id, email, name, role, status)
VALUES ('uuid', 'faculty@dpnhs.edu.ph', 'Test Faculty', 'faculty', 'active');

-- Registrar
INSERT INTO profiles (id, email, name, role, status)
VALUES ('uuid', 'registrar@dpnhs.edu.ph', 'Test Registrar', 'registrar', 'active');

-- Admin
INSERT INTO profiles (id, email, name, role, status)
VALUES ('uuid', 'admin@dpnhs.edu.ph', 'Test Admin', 'main_admin', 'active');
```

---

## 🚀 All Routes Are Correct

✅ **Student Role:**    /student-login → /student-dashboard
✅ **Teacher Role:**    /faculty-login → /teacher-dashboard
✅ **Faculty Role:**    /faculty-login → /faculty-dashboard
✅ **Registrar Role:**  /faculty-login → /registrar-dashboard
✅ **Admin Role:**      /faculty-login → /admin-dashboard

**All role routes are properly configured and secured!**

