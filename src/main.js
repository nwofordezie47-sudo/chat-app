import './style.css';
import socket from './socket';

const app = document.querySelector('#app');

let username = '';
let currentRoom = 'general';

// Initial State: Show Login Modal
let isLoginMode = true;

function renderLogin() {
  const title = isLoginMode ? 'Login' : 'Sign Up';
  const toggleText = isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login';
  const btnText = isLoginMode ? 'Login' : 'Sign Up';

  app.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h2>${title}</h2>
        <div id="auth-error" class="error-msg"></div>
        <form id="auth-form">
          <input type="text" id="username-input" placeholder="Username" required />
          <input type="password" id="password-input" placeholder="Password" required />
          <button type="submit" id="join-btn">${btnText}</button>
        </form>
        <p class="toggle-auth" id="toggle-auth">${toggleText}</p>
      </div>
    </div>
  `;

  document.querySelector('#auth-form').addEventListener('submit', handleAuth);
  document.querySelector('#toggle-auth').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    renderLogin();
  });
}

async function handleAuth(e) {
  e.preventDefault();
  const userIn = document.querySelector('#username-input').value.trim();
  const passIn = document.querySelector('#password-input').value.trim();
  const errorEl = document.querySelector('#auth-error');

  if (!userIn || !passIn) {
    errorEl.textContent = 'Please fill in all fields.';
    return;
  }

  const endpoint = isLoginMode ? '/login' : '/register';
  // Use current origin + server port (assuming proxy or same origin, but detailed explicitly here)
  // Since Vite proxy isn't set up for /login in the provided config, we might need full URL if ports differ.
  // The server is on 3001. Vite is likely 5173.
  // I will assume we need to hit http://localhost:3001
  // Wait, the client socket connects to 'https://chat-app-f9bz.onrender.com' in socket.js!
  // The user didn't say to change that. But I am adding the feature locally.
  // I should probably point to the local server for now or update socket.js to be dynamic.
  // The user's prompt implies adding features to THIS codebase.
  // If I add backend code to `server/index.js` but the client points to a deployed Render URL, my changes won't work!
  // I MUST update `socket.js` to point to localhost or the same origin.
  // For now, I'll aim at localhost:3001 since I see `server.listen(3001)` in server/index.js.
  
  const serverUrl = 'http://localhost:3001'; 

  try {
    const res = await fetch(`${serverUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userIn, password: passIn })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Authentication failed';
      return;
    }

    if (isLoginMode) {
      username = data.username;
      joinChat();
    } else {
      // Registration successful, switch to login or auto-login
      alert('Registration successful! Please login.');
      isLoginMode = true;
      renderLogin();
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Failed to connect to server.';
  }
}

function joinChat() {
  socket.auth = { username }; // Send auth data if needed, or just emit login
  socket.connect(); // Ensure socket connects
  socket.emit('login', username); // Register user
  socket.emit('join_room', 'general'); // Join global by default
  renderChat();
}

function renderChat() {
  app.innerHTML = `
    <div class="chat-container">
      <aside class="sidebar" id="sidebar">
        <h3>Chats</h3>
        <p onclick="switchRoom('general')"># General (Global)</p>
        <br>
        <h3>Online Users</h3>
        <div id="user-list"></div>
        <br>
        <div style="margin-top:auto; font-size:0.8em; opacity:0.6;">
          Logged in as: <b>${username}</b>
        </div>
      </aside>
      <main class="chat-area">
        <header class="chat-header" id="chat-header">
          <div style="display:flex; align-items:center;">
            <button class="menu-btn" onclick="toggleSidebar()">☰</button>
            <h3># ${currentRoom}</h3>
          </div>
        </header>
        <div class="message-list" id="message-list"></div>
        <div id="typing-indicator" style="padding: 0 2rem; color: var(--text-secondary); font-size: 0.8rem; height: 1.2rem;"></div>
        <div class="input-area">
          <label for="file-input" class="file-btn">📎</label>
          <input type="file" id="file-input" style="display:none" accept="image/*" />
          <input type="text" class="message-input" id="message-input" placeholder="Type a message..." />
          <button class="send-btn" id="send-btn">Send</button>
        </div>
      </main>
      <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
    </div>
  `;

  const sendBtn = document.querySelector('#send-btn');
  const messageInput = document.querySelector('#message-input');
  const fileInput = document.querySelector('#file-input');

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  fileInput.addEventListener('change', handleFileUpload);

  messageInput.addEventListener('input', () => {
    socket.emit('typing', { room: currentRoom, user: username });
  });
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 1024 * 1024) { // 1MB limit
    alert('File is too large. Max 1MB.');
    e.target.value = ''; // Reset
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const base64 = reader.result;
    const messageData = {
      room: currentRoom,
      author: username,
      message: '', // Empty text
      file: base64,
      fileName: file.name,
      fileType: file.type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    socket.emit('send_message', messageData);
    addMessageToUI(messageData, true);
    
    e.target.value = ''; // Reset input
  };
}

function toggleSidebar() {
  document.querySelector('#sidebar').classList.toggle('active');
  document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function switchRoom(room) {
  currentRoom = room;
  document.querySelector('#chat-header h3').textContent = `# ${room}`;
  document.querySelector('#message-list').innerHTML = '';
  
  // Close sidebar on mobile when room is selected
  document.querySelector('#sidebar').classList.remove('active');
  document.querySelector('.sidebar-overlay').classList.remove('active');
  
  if (room === 'general') {
    socket.emit('join_room', 'general');
  }
  socket.emit('read_messages', { room, user: username });
}

function startPrivateChat(targetUser) {
  if (targetUser === username) {
    alert("You cannot chat with yourself!");
    return; 
  }

  // Visual feedback
  const header = document.querySelector('#chat-header h3');
  if (header) header.textContent = `Starting chat with ${targetUser}...`;
  document.body.style.cursor = 'wait';

  socket.emit('join_private', targetUser);
  
  // Close sidebar on mobile
  document.querySelector('#sidebar').classList.remove('active');
  document.querySelector('.sidebar-overlay').classList.remove('active');
}

// Socket Listeners for Private Chat
socket.on('user_list', (users) => {
  const userListEl = document.querySelector('#user-list');
  if (!userListEl) return;
  
  userListEl.innerHTML = users
    .filter(u => u !== username) // Don't show self
    .map(u => `<p onclick="startPrivateChat('${u}')">👤 ${u}</p>`)
    .join('');
});

socket.on('private_room_joined', (data) => {
  document.body.style.cursor = 'default';
  currentRoom = data.room;
  document.querySelector('#chat-header h3').textContent = `Chat with ${data.partner}`;
  document.querySelector('#message-list').innerHTML = '';
});

function sendMessage() {
  const input = document.querySelector('#message-input');
  const message = input.value.trim();

  if (message) {
    const messageData = {
      room: currentRoom,
      author: username,
      message: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send_message', messageData);
    addMessageToUI(messageData, true);
    input.value = '';
  }
}

function addMessageToUI(data, isOwn, container) {
  const messageList = container || document.querySelector('#message-list');
  if (!messageList) return;

  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(isOwn ? 'own' : 'other');

  let contentHtml = `<div class="message-content">${data.message}</div>`;
  
  if (data.file) {
    if (data.fileType.startsWith('image/')) {
      contentHtml = `<div class="message-content"><img src="${data.file}" style="max-width: 200px; border-radius: 8px;" alt="${data.fileName}" /></div>`;
    } else {
      contentHtml = `<div class="message-content"><a href="${data.file}" download="${data.fileName}" style="color:var(--accent-color)">📄 ${data.fileName}</a></div>`;
    }
  }

  messageElement.innerHTML = `
    <div class="message-meta">
      ${isOwn ? 'You' : data.author} 
      <span style="font-weight:normal; font-size:0.7em; margin-left:5px;">${data.time}</span>
      ${isOwn ? `<span class="read-status" style="margin-left:5px;">${data.read ? '✓✓' : '✓'}</span>` : ''}
    </div>
    ${contentHtml}
  `;

  messageList.appendChild(messageElement);
  
  // Only scroll if we are not batch loading (i.e. no container passed)
  if (!container) {
    // Set timeout to ensure DOM update is processed before scrolling
    setTimeout(() => {
      messageList.scrollTop = messageList.scrollHeight;
    }, 10);
  }
}

// Theme Management
const themeToggleBtn = document.createElement('button');
themeToggleBtn.classList.add('theme-toggle');
themeToggleBtn.innerHTML = '🌙'; // Default icon
document.body.appendChild(themeToggleBtn);

function updateThemeIcon(theme) {
  themeToggleBtn.innerHTML = theme === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'dark';
document.body.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggleBtn.addEventListener('click', toggleTheme);

// Socket Listeners
socket.on('connect', () => {
  console.log('Socket connected/reconnected');
  if (username) {
    socket.emit('login', username);
    socket.emit('join_room', currentRoom);
  }
});

socket.on('receive_message', (data) => {
  if (data.room === currentRoom) {
    addMessageToUI(data, false);
    socket.emit('read_messages', { room: currentRoom, user: username });
  } else {
    // Optional: Show a notification badge for other rooms
    // const notification = new Notification('New Message', { body: data.message });
  }
});

let typingTimeout;
socket.on('typing', (data) => {
  const typingEl = document.querySelector('#typing-indicator');
  if (typingEl) {
    typingEl.textContent = `${data.user} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingEl.textContent = '';
    }, 3000);
  }
});

socket.on('messages_read', ({ room }) => {
  if (room === currentRoom) {
    document.querySelectorAll('.read-status').forEach(el => {
      el.textContent = '✓✓';
    });
  }
});

socket.on('load_messages', (messages) => {
  const messageList = document.querySelector('#message-list');
  if (messageList) {
    messageList.innerHTML = ''; // Clear existing
    
    // Create a document fragment to batch DOM insertions
    const fragment = document.createDocumentFragment();
    
    messages.forEach(msg => {
      // Pass the fragment as the container
      addMessageToUI(msg, msg.author === username, fragment);
    });
    
    // Append all messages at once
    messageList.appendChild(fragment);
    
    // Scroll to bottom once
    messageList.scrollTop = messageList.scrollHeight;

    // Mark messages as read if we are entering the room
    socket.emit('read_messages', { room: currentRoom, user: username });
  }
});

// Start App
renderLogin();

// Expose functions to window so HTML onclick attributes works
window.switchRoom = switchRoom;
window.startPrivateChat = startPrivateChat;
window.toggleSidebar = toggleSidebar;
