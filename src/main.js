import './style.css';
import socket from './socket';

const app = document.querySelector('#app');

let username = '';
let currentRoom = 'general';

// Initial State: Show Login Modal
function renderLogin() {
  app.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h2>Join Chat</h2>
        <input type="text" id="username-input" placeholder="Enter your username..." />
        <button id="join-btn">Join</button>
      </div>
    </div>
  `;

  document.querySelector('#join-btn').addEventListener('click', joinChat);
  document.querySelector('#username-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
  });
}

function joinChat() {
  const input = document.querySelector('#username-input');
  if (input.value.trim()) {
    username = input.value.trim();
    socket.emit('login', username); // Register user
    socket.emit('join_room', 'general'); // Join global by default
    renderChat();
  }
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
        <div class="input-area">
          <input type="text" class="message-input" id="message-input" placeholder="Type a message..." />
          <button class="send-btn" id="send-btn">Send</button>
        </div>
      </main>
      <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
    </div>
  `;

  const sendBtn = document.querySelector('#send-btn');
  const messageInput = document.querySelector('#message-input');

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
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
}

function startPrivateChat(targetUser) {
  if (targetUser === username) return; // Can't chat with self
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

function addMessageToUI(data, isOwn) {
  const messageList = document.querySelector('#message-list');
  if (!messageList) return;

  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(isOwn ? 'own' : 'other');

  messageElement.innerHTML = `
    <div class="message-meta">${isOwn ? 'You' : data.author} <span style="font-weight:normal; font-size:0.7em; margin-left:5px;">${data.time}</span></div>
    <div class="message-content">${data.message}</div>
  `;

  messageList.appendChild(messageElement);
  messageList.scrollTop = messageList.scrollHeight;
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
socket.on('receive_message', (data) => {
  addMessageToUI(data, false);
});

socket.on('load_messages', (messages) => {
  const messageList = document.querySelector('#message-list');
  if (messageList) {
    messageList.innerHTML = ''; // Clear existing to avoid duplicates if re-joining
    messages.forEach(msg => {
      addMessageToUI(msg, msg.author === username);
    });
  }
});

// Start App
renderLogin();

// Expose functions to window so HTML onclick attributes works
window.switchRoom = switchRoom;
window.startPrivateChat = startPrivateChat;
window.toggleSidebar = toggleSidebar;
