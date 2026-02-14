# Google Sign-In Implementation Guide

This document outlines how to add Google Authentication to ScoutAI.

## Overview

Google Sign-In will allow users to securely authenticate using their Google accounts. This provides:
- Secure authentication without managing passwords
- User profile information (name, email, photo)
- Session management
- Multi-user support

## Implementation Steps

### 1. Install Required Dependencies

```bash
pip install flask-login google-auth google-auth-oauthlib google-auth-httplib2
```

Add to `requirements.txt`:
```
flask-login==0.6.3
google-auth==2.25.2
google-auth-oauthlib==1.2.0
google-auth-httplib2==0.2.0
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable Google+ API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Name: "ScoutAI"
   - Authorized redirect URIs:
     - `http://localhost:5001/auth/google/callback` (development)
     - `https://your-domain.com/auth/google/callback` (production)
   - Click "Create"
   - Save the Client ID and Client Secret

### 3. Environment Variables

Add to `.env` file:
```bash
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
SECRET_KEY=your_random_secret_key_here  # For Flask sessions
```

Generate secret key:
```python
import secrets
print(secrets.token_hex(32))
```

### 4. Database Schema for Users

Create `database_migrations.py` function:

```python
def create_users_table(db_path=None):
    """Create users table for authentication."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_id TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            picture TEXT,
            created_at TEXT NOT NULL,
            last_login TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()
```

### 5. Flask-Login Setup in dashboard.py

```python
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from google.oauth2 import id_token
from google.auth.transport import requests
import os

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# User class
class User(UserMixin):
    def __init__(self, id, google_id, email, name, picture):
        self.id = id
        self.google_id = google_id
        self.email = email
        self.name = name
        self.picture = picture

@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
    user_data = conn.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if user_data:
        return User(
            id=user_data['id'],
            google_id=user_data['google_id'],
            email=user_data['email'],
            name=user_data['name'],
            picture=user_data['picture']
        )
    return None
```

### 6. Authentication Routes

```python
@app.route('/login')
def login():
    """Show login page with Google Sign-In button."""
    return render_template('login.html',
                         client_id=os.getenv('GOOGLE_CLIENT_ID'))

@app.route('/auth/google', methods=['POST'])
def google_auth():
    """Verify Google ID token and create session."""
    token = request.json.get('credential')

    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            os.getenv('GOOGLE_CLIENT_ID')
        )

        google_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')

        # Check if user exists
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row

        user = conn.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ).fetchone()

        now = datetime.now(timezone.utc).isoformat()

        if user:
            # Update last login
            conn.execute(
                "UPDATE users SET last_login = ? WHERE google_id = ?",
                (now, google_id)
            )
            user_id = user['id']
        else:
            # Create new user
            cursor = conn.execute("""
                INSERT INTO users (google_id, email, name, picture, created_at, last_login)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (google_id, email, name, picture, now, now))
            user_id = cursor.lastrowid

        conn.commit()
        conn.close()

        # Create User object and log in
        user_obj = User(user_id, google_id, email, name, picture)
        login_user(user_obj, remember=True)

        return jsonify({'success': True, 'redirect': '/signal'})

    except ValueError as e:
        return jsonify({'success': False, 'error': 'Invalid token'}), 401

@app.route('/logout')
@login_required
def logout():
    """Log out the current user."""
    logout_user()
    return redirect('/login')
```

### 7. Protect Routes with @login_required

Add to existing routes:
```python
@app.route("/signal")
@login_required  # Add this decorator
def signal_dashboard():
    # existing code...
```

### 8. Create Login Template

Create `templates/login.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ScoutAI - Login</title>
    <link rel="stylesheet" href="/static/signal-ai.css">
    <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <!-- Logo -->
            <div class="login-logo">
                <svg width="80" height="80" viewBox="0 0 64 64" fill="none">
                    <!-- Same SVG as splash screen -->
                </svg>
            </div>

            <h1 class="login-title">Welcome to ScoutAI</h1>
            <p class="login-subtitle">Discover What's Working in Social Media</p>

            <!-- Google Sign-In Button -->
            <div id="g_id_onload"
                 data-client_id="{{ client_id }}"
                 data-callback="handleCredentialResponse">
            </div>
            <div class="g_id_signin"
                 data-type="standard"
                 data-size="large"
                 data-theme="filled_blue"
                 data-text="signin_with"
                 data-shape="rectangular"
                 data-logo_alignment="left">
            </div>
        </div>
    </div>

    <script>
    function handleCredentialResponse(response) {
        fetch('/auth/google', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                credential: response.credential
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                window.location.href = data.redirect;
            } else {
                alert('Authentication failed: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Authentication failed');
        });
    }
    </script>
</body>
</html>
```

### 9. Add Login Page Styles to signal-ai.css

```css
/* Login Page */
.login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0a0e1f 0%, #141b2e 50%, #0f1629 100%);
}

.login-box {
    background: var(--signal-bg-secondary);
    border: 1px solid var(--signal-border);
    border-radius: 20px;
    padding: 60px 50px;
    text-align: center;
    max-width: 450px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.login-logo {
    width: 80px;
    height: 80px;
    margin: 0 auto 30px;
}

.login-title {
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--signal-cyan), #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 12px;
}

.login-subtitle {
    color: var(--signal-text-secondary);
    margin-bottom: 40px;
    font-size: 16px;
}
```

### 10. Update Config

Add to `config.py`:

```python
# Secret key for session management
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
```

### 11. Display User Info in UI

Update `signal.html` header to show user:

```html
<div class="signal-user-menu">
    {% if current_user.is_authenticated %}
        <img src="{{ current_user.picture }}" class="user-avatar" />
        <span>{{ current_user.name }}</span>
        <a href="/logout">Logout</a>
    {% endif %}
</div>
```

## Testing

1. Clear browser cookies/session storage
2. Navigate to `http://localhost:5001`
3. Should redirect to `/login`
4. Click "Sign in with Google"
5. Complete Google authentication
6. Should redirect to `/signal` dashboard
7. User session should persist across page refreshes
8. Logout should clear session and redirect to login

## Security Considerations

1. **HTTPS Required**: In production, always use HTTPS
2. **Secret Key**: Use a strong random secret key, never commit to version control
3. **Token Validation**: Always verify Google ID tokens server-side
4. **Session Security**: Configure secure session cookies in production
5. **CORS**: Configure appropriate CORS settings for production domain

## Multi-User Data Isolation

To support multiple users, associate data with user IDs:

```python
# Add user_id to verticals table
ALTER TABLE verticals ADD COLUMN user_id INTEGER REFERENCES users(id);

# Filter queries by current user
verticals = VerticalManager().list_verticals_for_user(current_user.id)
```

## Next Steps

1. Implement role-based access control (admin, user)
2. Add user profile page
3. Implement team/workspace sharing
4. Add usage analytics per user
5. Implement billing/subscription tiers

## Resources

- [Google Sign-In Documentation](https://developers.google.com/identity/gsi/web/guides/overview)
- [Flask-Login Documentation](https://flask-login.readthedocs.io/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
