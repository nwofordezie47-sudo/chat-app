import './style.css';
import socket from './socket';
import Toastify from 'toastify-js';
import "toastify-js/src/toastify.css";

const app = document.querySelector('#app');

const infoModalOverlay = document.createElement('div');
infoModalOverlay.className = 'info-modal-overlay';
infoModalOverlay.innerHTML = `
  <div class="info-modal">
    <h2 id="modal-title"></h2>
    <p id="modal-message"></p>
    <button id="modal-close">OK</button>
  </div>
`;
document.body.appendChild(infoModalOverlay);

const modalTitle = infoModalOverlay.querySelector('#modal-title');
const modalMessage = infoModalOverlay.querySelector('#modal-message');
const modalClose = infoModalOverlay.querySelector('#modal-close');

modalClose.onclick = () => infoModalOverlay.classList.remove('active');

function showModal(title, message) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  infoModalOverlay.classList.add('active');
}

// Context Menu
const contextMenu = document.createElement('div');
contextMenu.className = 'context-menu';
contextMenu.innerHTML = `
    <div class="context-menu-item" id="cm-copy">📋 Copy</div>
    <div class="context-menu-item" id="cm-forward">↗️ Forward</div>
    <div class="context-menu-item" id="cm-edit">✏️ Edit</div>
    <div class="context-menu-item delete" id="cm-delete">🗑️ Delete</div>
`;
document.body.appendChild(contextMenu);

// Shot Viewer
const shotViewer = document.createElement('div');
shotViewer.className = 'shot-viewer-overlay';
shotViewer.innerHTML = `
    <div class="shot-timer">10</div>
    <img class="shot-image" src="" alt="Shot" />
`;
document.body.appendChild(shotViewer);

let selectedMessageId = null;
let selectedMessageText = '';
let selectedMessageData = null;

document.addEventListener('click', () => contextMenu.classList.remove('active'));

// Action Listeners
document.querySelector('#cm-copy').onclick = () => {
    navigator.clipboard.writeText(selectedMessageText);
    Toastify({ text: "Copied to clipboard", duration: 2000 }).showToast();
};

document.querySelector('#cm-edit').onclick = () => {
    const newText = prompt("Edit message:", selectedMessageText);
    if (newText !== null && newText.trim() !== "" && newText !== selectedMessageText) {
        handleEdit(selectedMessageId, newText.trim());
    }
};

document.querySelector('#cm-delete').onclick = () => {
    if (confirm("Delete this message?")) {
        handleDelete(selectedMessageId);
    }
};

document.querySelector('#cm-forward').onclick = () => {
    showForwardModal();
};

// Forward Modal
const forwardModalOverlay = document.createElement('div');
forwardModalOverlay.className = 'modal-overlay';
forwardModalOverlay.id = 'forward-modal';
forwardModalOverlay.innerHTML = `
    <div class="modal">
        <h2>Forward Message</h2>
        <div id="forward-user-list" style="max-height: 300px; overflow-y: auto; text-align: left; margin-bottom: 1.5rem;"></div>
        <button id="forward-close">Cancel</button>
    </div>
`;
document.body.appendChild(forwardModalOverlay);

document.querySelector('#forward-close').onclick = () => forwardModalOverlay.classList.remove('active');

async function handleEdit(id, newText) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/messages/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: newText })
        });
        if (!res.ok) showError("Failed to edit message");
    } catch (e) {
        showError("Connection error");
    }
}

async function handleDelete(id) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/messages/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) showError("Failed to delete message");
    } catch (e) {
        showError("Connection error");
    }
}

function showForwardModal() {
    const listEl = document.querySelector('#forward-user-list');
    listEl.innerHTML = '<p style="text-align:center; opacity:0.5;">Loading users...</p>';
    forwardModalOverlay.classList.add('active');
    
    socket.emit('get_online_users');
}

socket.on('update_user_list', (usersList) => {
    const forwardListEl = document.querySelector('#forward-user-list');
    const sidebarUserList = document.querySelector('#user-list');
    
    const usersHtml = usersList
        .filter(u => u !== username)
        .map(u => `<p class="user-item" data-username="${u}">👤 ${u}</p>`)
        .join('');
        
    if (sidebarUserList) sidebarUserList.innerHTML = usersHtml;
    if (forwardListEl) {
        forwardListEl.innerHTML = usersHtml;
        forwardListEl.querySelectorAll('.user-item').forEach(item => {
            item.onclick = () => {
                forwardTo(item.getAttribute('data-username'));
                forwardModalOverlay.classList.remove('active');
            };
        });
    }
});

function forwardTo(targetUser) {
    if (!selectedMessageData) return;
    
    // We need to join the private room first if it's not the current one
    // But for a simple forward, we can just determine the room name and emit
    const targetRoom = [username, targetUser].sort().join('_');
    
    const forwardData = {
        room: targetRoom,
        author: username,
        message: selectedMessageText,
        file: selectedMessageData.file,
        fileName: selectedMessageData.fileName,
        fileType: selectedMessageData.fileType,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    socket.emit('send_message', forwardData);
    Toastify({ text: `Forwarded to ${targetUser}`, duration: 2000 }).showToast();
}

function showError(message) {
  Toastify({
    text: message,
    duration: 3000,
    close: true,
    gravity: "top",
    position: "right",
    className: "toastify-error",
    stopOnFocus: true
  }).showToast();
}

let username = '';
let currentRoom = 'general';
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
          ${!isLoginMode ? '<input type="email" id="email-input" placeholder="Email" required />' : ''}
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
  const emailIn = !isLoginMode ? document.querySelector('#email-input').value.trim() : null;
  const errorEl = document.querySelector('#auth-error');

  if (!userIn || !passIn || (!isLoginMode && !emailIn)) {
    showError('Please fill in all fields.');
    return;
  }

  const endpoint = isLoginMode ? '/login' : '/register';
  const serverUrl = import.meta.env.VITE_BACKEND_URL || ''; 

  try {
    const res = await fetch(`${serverUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: userIn, 
        password: passIn,
        ...(emailIn && { email: emailIn })
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Authentication failed');
      return;
    }

    if (isLoginMode) {
      username = data.username;
      joinChat();
    } else {
      showModal('Registration Successful', 'Your account has been created. Please login.');
      isLoginMode = true;
      renderLogin();
    }
  } catch (err) {
    console.error(err);
    showError('Failed to connect to server.');
  }
}

async function joinChat() {
  socket.auth = { username };
  socket.connect();
  socket.emit('login', username);
  socket.emit('join_room', 'general');
  renderChat();
  loadRooms();
}

let userGroups = [];
let userFriends = [];
let onlineUsersList = [];

async function loadRooms() {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const [groupsRes, friendsRes] = await Promise.all([
            fetch(`${serverUrl}/groups/${username}`),
            fetch(`${serverUrl}/friends/${username}`)
        ]);
        
        if (groupsRes.ok) userGroups = await groupsRes.json();
        if (friendsRes.ok) userFriends = await friendsRes.json();
        
        updateRoomList();
    } catch (e) {
        console.error("Failed to load rooms");
    }
}

function updateRoomList() {
    const roomList = document.querySelector('#room-list');
    if (!roomList) return;
    
    // Combine groups and friends for sorting
    const allChats = [
        ...userGroups.map(g => ({ ...g, isGroup: true })),
        ...userFriends.map(f => ({ 
            ...f, 
            name: f.username, 
            isGroup: false, 
            room: [username, f.username].sort().join('_') 
        }))
    ];

    // Sort by recent message
    allChats.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    let html = `
        <div onclick="switchRoom('general')" class="user-item-enhanced ${currentRoom === 'general' ? 'active' : ''}">
            <div class="avatar-ring">🌐</div>
            <div style="flex:1;">
                <div style="font-weight:bold;"># General</div>
                <div style="font-size:0.8rem; opacity:0.6;">Global Chat</div>
            </div>
        </div>
    `;
    
    allChats.forEach(c => {
        const roomName = c.isGroup ? c.name : c.room;
        const displayName = c.isGroup ? c.name : c.username;
        const icon = c.isGroup ? '👥' : (onlineUsersList.includes(displayName) ? '🟢' : '⚪');
        
        html += `
            <div onclick="switchRoom('${roomName}', ${c.isGroup}, '${c._id || ''}')" class="user-item-enhanced ${currentRoom === roomName ? 'active' : ''}">
                <div class="avatar-ring">
                    ${displayName[0].toUpperCase()}
                    ${!c.isGroup && onlineUsersList.includes(displayName) ? `<div class="online-dot" style="background:#2ecc71;"></div>` : ''}
                </div>
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-weight:bold;">${displayName}</span>
                        ${c.streak > 0 ? `🔥 ${c.streak}` : ''}
                        ${c.shotScore > 0 ? `🎯 ${c.shotScore}` : ''}
                    </div>
                    <div style="font-size:0.8rem; opacity:0.6; display:flex; align-items:center; gap:4px;">
                        ${c.lastMessage?.type === 'shot' ? '🔫' : ''}
                        ${c.lastMessage?.type === 'missed_call' ? '📞' : ''}
                        <span>${c.lastMessage?.text || 'No messages'}</span>
                    </div>
                </div>
                ${c.unreadCount > 0 ? `<div style="background:var(--accent-color); color:white; min-width:18px; height:18px; border-radius:9px; font-size:0.7rem; display:flex; align-items:center; justify-content:center; padding:0 5px;">${c.unreadCount}</div>` : ''}
            </div>
        `;
    });
    
    roomList.innerHTML = html;
}

socket.on('update_user_list', (usersList) => {
    onlineUsersList = usersList;
    const sidebarUserList = document.querySelector('#user-list');
    const forwardListEl = document.querySelector('#forward-user-list');
    
    const usersHtml = usersList
        .filter(u => u !== username)
        .map(u => {
            const isOnline = true; // They are in this list, so they are online
            return `
            <div class="user-item-enhanced" onclick="startPrivateChat('${u}')">
                <div class="avatar-ring">
                    ${u[0].toUpperCase()}
                    <div class="online-dot" style="background:#2ecc71;"></div>
                </div>
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-weight:bold;">${u}</span>
                    </div>
                </div>
            </div>`;
        })
        .join('');
        
    if (sidebarUserList) sidebarUserList.innerHTML = usersHtml;
    // ... forward modal handled previously ...
});

function renderChat() {
  app.innerHTML = `
    <div class="chat-container">
      <aside class="sidebar" id="sidebar">
        <div class="tab-bar">
            <div class="tab-item active" onclick="switchTab('chats')" data-tab="chats">
                <span>💬</span>
                <span class="tab-label">CHATS</span>
            </div>
            <div class="tab-item" onclick="switchTab('feed')" data-tab="feed">
                <span>📸</span>
                <span class="tab-label">FEED</span>
            </div>
            <div class="tab-item" onclick="switchTab('space')" data-tab="space">
                <span>🌌</span>
                <span class="tab-label">SPACE</span>
            </div>
            <div class="tab-item" onclick="switchTab('settings')" data-tab="settings">
                <span>👤</span>
                <span class="tab-label">ME</span>
            </div>
        </div>

        <div id="chats-view" class="view-section active">
            <div style="padding: 15px; display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0;">Chats</h2>
                <button onclick="showFindFriends()" style="background:none; border:none; color:var(--accent-color); font-size:1.5rem; cursor:pointer;">➕</button>
            </div>
            <div id="room-list"></div>
            <br>
            <h3 style="padding: 0 15px;">Online Users</h3>
            <div id="user-list"></div>
        </div>

        <div id="feed-view" class="view-section">
            <div style="padding: 20px;">
                <h2>Social Feed</h2>
                <div id="feed-container"></div>
            </div>
        </div>

        <div id="space-view" class="view-section">
            <div style="padding: 20px;">
                <h2>Space / Stories</h2>
                <div id="stories-container"></div>
            </div>
        </div>

        <div id="settings-view" class="view-section">
            <div style="padding: 20px; text-align:center;">
                <div class="call-avatar" style="margin: 0 auto 1rem;">${username[0].toUpperCase()}</div>
                <h2>${username}</h2>
                <button onclick="toggleTheme()" id="theme-btn-main" style="margin: 20px 0; width: 100%;">Toggle Theme</button>
                <button onclick="location.reload()" style="background:#e74c3c; color:white; width: 100%;">Logout</button>
            </div>
        </div>

        <div style="margin-top:auto; padding: 10px; font-size:0.8em; opacity:0.6; border-top: 1px solid var(--glass-border);">
          Logged in as: <b>${username}</b>
        </div>
      </aside>

      <main class="chat-area">
        <header class="chat-header" id="chat-header">
          <div style="display:flex; align-items:center; gap: 15px;">
            <button class="menu-btn" onclick="toggleSidebar()">☰</button>
            <h3 id="chat-title"># general</h3>
          </div>
          <div id="header-actions" style="display:flex; gap: 15px; align-items:center;">
              <button onclick="startCall('voice')" class="header-icon">📞</button>
              <button onclick="startCall('video')" class="header-icon">📹</button>
              <button id="group-settings-btn" class="header-icon" style="display:none;">⚙️</button>
          </div>
        </header>
        <div class="message-list" id="message-list"></div>
        <div id="typing-indicator" style="padding: 0 2rem; color: var(--secondary-text); font-size: 0.8rem; height: 1.2rem;"></div>
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

  document.querySelector('#send-btn').addEventListener('click', sendMessage);
  document.querySelector('#message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  document.querySelector('#file-input').addEventListener('change', handleFileUpload);
  document.querySelector('#message-input').addEventListener('input', () => {
    socket.emit('typing', { room: currentRoom, user: username });
  });
  
  updateRoomList();
}

async function fetchFeed() {
    const container = document.querySelector('#feed-container');
    container.innerHTML = '<p style="text-align:center; opacity:0.5;">Loading feed...</p>';
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/feed/${username}`);
        if (res.ok) {
            const posts = await res.json();
            container.innerHTML = posts.map(p => `
                <div class="feed-post">
                    <div class="feed-header">
                        <div class="avatar-ring" style="width:30px; height:30px; font-size:0.8rem;">${p.user.username[0].toUpperCase()}</div>
                        <span>${p.user.username}</span>
                    </div>
                    <img src="${p.mediaUrl}" class="post-media" onerror="this.src='https://placehold.co/600x400?text=Post+Image'">
                    <div class="post-info">
                        <div class="post-caption"><b>${p.user.username}</b> ${p.content || ''}</div>
                        <div style="font-size:0.8rem; opacity:0.5; margin-top:5px;">${new Date(p.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
            `).join('') || '<p style="text-align:center; opacity:0.5;">No posts yet. Add some friends!</p>';
        }
    } catch (e) { container.innerHTML = 'Error loading feed'; }
}

async function fetchStories() {
    const container = document.querySelector('#stories-container');
    container.innerHTML = '<p style="text-align:center; opacity:0.5;">Loading stories...</p>';
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/stories/${username}`);
        if (res.ok) {
            const stories = await res.json();
            container.innerHTML = `
                <div style="display:flex; gap:15px; overflow-x:auto; padding-bottom:10px;">
                    ${stories.map(s => `
                        <div class="story-item" onclick="viewStory('${s.user.username}')" style="flex-shrink:0; text-align:center; cursor:pointer;">
                            <div class="avatar-ring" style="width:60px; height:60px; border: 3px solid var(--accent-color); padding:2px;">
                                <div style="width:100%; height:100%; border-radius:50%; background:#888; display:flex; align-items:center; justify-content:center;">
                                    ${s.user.username[0].toUpperCase()}
                                </div>
                            </div>
                            <div style="font-size:0.7rem; margin-top:5px; font-weight:bold;">${s.user.username}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:20px; opacity:0.5; text-align:center;">
                    <p>Tap a story to view</p>
                </div>
            `;
        }
    } catch (e) { container.innerHTML = 'Error loading stories'; }
}

window.fetchFeed = fetchFeed;
function switchTab(tabId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    
    document.querySelector(`#${tabId}-view`).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    if (tabId === 'feed') fetchFeed();
    if (tabId === 'space') fetchStories();
    
    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('#sidebar').classList.remove('active');
        document.querySelector('.sidebar-overlay').classList.remove('active');
    }
}

function viewStory(user) {
    Toastify({ text: `Viewing stories from ${user}...`, duration: 2000 }).showToast();
    // In a full implementation, this would open a Story Viewer modal like on RN
}

window.switchTab = switchTab;
window.viewStory = viewStory;

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 1024 * 1024) {
    showError('File is too large. Max 1MB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const messageData = {
      room: currentRoom,
      author: username,
      message: '',
      file: reader.result,
      fileName: file.name,
      fileType: file.type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socket.emit('send_message', messageData);
    addMessageToUI(messageData, true);
    e.target.value = '';
  };
}

function toggleSidebar() {
  document.querySelector('#sidebar').classList.toggle('active');
  document.querySelector('.sidebar-overlay').classList.toggle('active');
}

let currentGroupId = null;

async function switchRoom(room, isGroup = false, groupId = null) {
  if (room === currentRoom && currentGroupId === groupId) return;
  
  // Leave old room
  socket.emit('leave_room', currentRoom);
  
  socket.emit('join_room', room);
  currentRoom = room;
  currentGroupId = groupId;
  
  const chatTitle = document.querySelector('#chat-title');
  if (chatTitle) chatTitle.textContent = isGroup ? `👥 ${room}` : `# ${room}`;
  
  const groupBtn = document.querySelector('#group-settings-btn');
  if (groupBtn) groupBtn.style.display = isGroup ? 'block' : 'none';
  
  // Clear messages and load new ones
  const messageList = document.querySelector('#message-list');
  if (messageList) messageList.innerHTML = '';
  
  const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
  try {
      const res = await fetch(`${serverUrl}/messages/${room}`);
      if (res.ok) {
          const messages = await res.json();
          messages.forEach(msg => {
              addMessageToUI(msg, msg.author === username);
          });
          messageList.scrollTop = messageList.scrollHeight;
      }
  } catch (e) {
      console.error("Failed to load messages", e);
  }

  // Mark room as read
  socket.emit('mark_read', { room, username });
  
  updateRoomList();
  
  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.querySelector('#sidebar').classList.remove('active');
    document.querySelector('.sidebar-overlay').classList.remove('active');
  }
}

window.switchRoom = switchRoom;
window.startPrivateChat = startPrivateChat;

function startPrivateChat(targetUser) {
  if (targetUser === username) {
    showError("You cannot chat with yourself!");
    return; 
  }
  const room = [username, targetUser].sort().join('_');
  switchRoom(room);
}

// Group Settings Modal
const groupSettingsOverlay = document.createElement('div');
groupSettingsOverlay.className = 'modal-overlay';
groupSettingsOverlay.innerHTML = `
    <div class="modal">
        <h2>Group Settings</h2>
        <div id="group-info" style="margin-bottom: 2rem;"></div>
        <button id="leave-group-btn" style="background:#e74c3c; color:white; margin-bottom:1rem; border:none; padding: 10px; border-radius: 8px; width: 100%; cursor:pointer;">Leave Group</button>
        <button id="delete-group-btn" style="background:#c0392b; color:white; display:none; border:none; padding: 10px; border-radius: 8px; width: 100%; cursor:pointer;">Delete Group (Admin)</button>
        <button id="close-settings" style="background:none; color:var(--text-secondary); border:none; cursor:pointer;">Close</button>
    </div>
`;
document.body.appendChild(groupSettingsOverlay);

document.querySelector('#close-settings').onclick = () => groupSettingsOverlay.classList.remove('active');

// Find Friends Modal
const findFriendsOverlay = document.createElement('div');
findFriendsOverlay.className = 'modal-overlay';
findFriendsOverlay.innerHTML = `
    <div class="modal">
        <h2>Find Friends</h2>
        <input type="text" id="friend-search-input" placeholder="Search by username..." style="margin-bottom:1rem;">
        <div id="friend-search-results" style="max-height: 200px; overflow-y: auto; text-align: left;"></div>
        <hr style="margin: 1rem 0; opacity: 0.1;">
        <h3>Pending Requests</h3>
        <div id="friend-requests-list" style="max-height: 150px; overflow-y: auto; text-align: left;"></div>
        <button id="close-find-friends" style="margin-top:1rem;">Close</button>
    </div>
`;
document.body.appendChild(findFriendsOverlay);

document.querySelector('#close-find-friends').onclick = () => findFriendsOverlay.classList.remove('active');

async function showFindFriends() {
    findFriendsOverlay.classList.add('active');
    loadFriendRequests();
}

async function loadFriendRequests() {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/friends/requests/${username}`);
        if (res.ok) {
            const requests = await res.json();
            const list = document.querySelector('#friend-requests-list');
            list.innerHTML = requests.map(r => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom: 1px solid var(--glass-border);">
                    <span>👤 ${r.username}</span>
                    <button onclick="acceptFriend('${r.username}')" style="background:var(--accent-color); color:white; padding: 5px 10px; font-size: 0.8rem;">Accept</button>
                </div>
            `).join('') || '<p style="opacity:0.5; text-align:center;">No pending requests</p>';
        }
    } catch (e) { console.error(e); }
}

const searchInput = document.querySelector('#friend-search-input');
searchInput.oninput = debounce(async () => {
    const query = searchInput.value.trim();
    if (query.length < 2) return;
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/users/search?q=${query}`);
        if (res.ok) {
            const users = await res.json();
            const results = document.querySelector('#friend-search-results');
            results.innerHTML = users.filter(u => u.username !== username).map(u => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px;">
                    <span>👤 ${u.username}</span>
                    <button onclick="sendFriendRequest('${u.username}')" style="background:none; border: 1px solid var(--accent-color); color:var(--accent-color); padding: 5px 10px; font-size: 0.8rem;">Add</button>
                </div>
            `).join('') || '<p style="opacity:0.5; text-align:center;">No users found</p>';
        }
    } catch (e) { console.error(e); }
}, 300);

// Calling UI
const incomingCallOverlay = document.createElement('div');
incomingCallOverlay.className = 'call-overlay incoming-call';
incomingCallOverlay.innerHTML = `
    <div class="call-avatar" id="incoming-avatar">?</div>
    <h2 id="incoming-caller-name">Incoming Call...</h2>
    <div class="call-actions">
        <button class="call-btn accept" id="accept-call">📞</button>
        <button class="call-btn decline" id="decline-call">✖</button>
    </div>
`;
document.body.appendChild(incomingCallOverlay);

const activeCallOverlay = document.createElement('div');
activeCallOverlay.className = 'call-overlay active-call';
activeCallOverlay.innerHTML = `
    <div class="call-avatar" id="active-avatar">?</div>
    <h2 id="active-peer-name">In Call...</h2>
    <p id="call-duration">00:00</p>
    <div id="remote-video" style="width: 100%; height: 300px; background:#000; display:none;"></div>
    <div class="call-actions">
        <button class="call-btn decline" id="end-call">✖</button>
    </div>
`;
document.body.appendChild(activeCallOverlay);

let agoraClient = null;
let localTracks = { videoTrack: null, audioTrack: null };

async function initAgora() {
    if (agoraClient) return;
    agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    agoraClient.on("user-published", async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        if (mediaType === "video") {
            const remoteVideo = document.querySelector("#remote-video");
            remoteVideo.style.display = "block";
            user.videoTrack.play("remote-video");
        }
        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    });
}

async function startAgoraCall(channelName, type) {
    await initAgora();
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    const tokenRes = await fetch(`${serverUrl}/agora-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: 0 })
    });
    const { token } = await tokenRes.json();
    
    await agoraClient.join("11579438c5924e1896ff965fbea3460a", channelName, token, 0);
    
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    if (type === "video") {
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
        await agoraClient.publish([localTracks.audioTrack, localTracks.videoTrack]);
    } else {
        await agoraClient.publish(localTracks.audioTrack);
    }
}

async function leaveAgoraCall() {
    if (localTracks.audioTrack) {
        localTracks.audioTrack.stop();
        localTracks.audioTrack.close();
    }
    if (localTracks.videoTrack) {
        localTracks.videoTrack.stop();
        localTracks.videoTrack.close();
    }
    if (agoraClient) {
        await agoraClient.leave();
    }
    const remoteVideo = document.querySelector("#remote-video");
    if (remoteVideo) {
        remoteVideo.style.display = "none";
        remoteVideo.innerHTML = "";
    }
}

function startCall(type) {
    if (currentRoom === 'general' || currentRoom.includes('_') === false) {
        showError("You can only call in private chats");
        return;
    }
    const peer = currentRoom.split('_').find(u => u !== username);
    activeCallOverlay.classList.add('active');
    document.querySelector('#active-peer-name').textContent = `Calling ${peer}...`;
    document.querySelector('#active-avatar').textContent = peer[0].toUpperCase();
    
    socket.emit('call_user', { to: peer, from: username, type, channelName: currentRoom });
    startAgoraCall(currentRoom, type);
}

socket.on('call_accepted', (data) => {
    document.querySelector('#active-peer-name').textContent = `In call with ${data.from}`;
    // Already joined Agora in startCall
});

socket.on('call_rejected', () => {
    activeCallOverlay.classList.remove('active');
    leaveAgoraCall();
    showError("Call rejected or busy");
});

socket.on('call_ended', () => {
    activeCallOverlay.classList.remove('active');
    leaveAgoraCall();
});

socket.on('incoming_call', (data) => {
    incomingCallOverlay.classList.add('active');
    document.querySelector('#incoming-caller-name').textContent = `${data.from} is calling...`;
    document.querySelector('#incoming-avatar').textContent = data.from[0].toUpperCase();
    
    document.querySelector('#accept-call').onclick = () => {
        incomingCallOverlay.classList.remove('active');
        activeCallOverlay.classList.add('active');
        document.querySelector('#active-peer-name').textContent = `In call with ${data.from}`;
        document.querySelector('#active-avatar').textContent = data.from[0].toUpperCase();
        socket.emit('answer_call', { to: data.from, from: username });
        startAgoraCall(data.channelName, data.type);
    };
    
    document.querySelector('#decline-call').onclick = () => {
        incomingCallOverlay.classList.remove('active');
        socket.emit('decline_call', { to: data.from, from: username });
    };
});

document.querySelector('#end-call').onclick = () => {
    const peer = currentRoom.split('_').find(u => u !== username);
    socket.emit('end_call', { to: peer });
    activeCallOverlay.classList.remove('active');
    leaveAgoraCall();
};

// Utils
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

async function sendFriendRequest(to) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/friends/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromUser: username, toUser: to })
        });
        if (res.ok) {
            Toastify({ text: "Request sent", duration: 2000 }).showToast();
            socket.emit('friend_request', { from: username, to });
        }
    } catch (e) { console.error(e); }
}

async function acceptFriend(from) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/friends/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, fromUsername: from })
        });
        if (res.ok) {
            Toastify({ text: "Friend added!", duration: 2000 }).showToast();
            socket.emit('friend_accept', { from: username, to: from });
            loadFriendRequests();
            loadRooms();
        }
    } catch (e) { console.error(e); }
}

window.showFindFriends = showFindFriends;
window.startCall = startCall;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriend = acceptFriend;

async function leaveGroup(groupId) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/groups/${groupId}/remove-member`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        if (res.ok) {
            Toastify({ text: "Left group", duration: 2000 }).showToast();
            groupSettingsOverlay.classList.remove('active');
            await loadRooms();
            switchRoom('general');
        } else {
            showError("Failed to leave group");
        }
    } catch (e) {
        showError("Connection error");
    }
}

async function deleteGroup(groupId) {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/groups/${groupId}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            Toastify({ text: "Group deleted", duration: 2000 }).showToast();
            groupSettingsOverlay.classList.remove('active');
            await loadRooms();
            switchRoom('general');
        } else {
            showError("Failed to delete group");
        }
    } catch (e) {
        showError("Connection error");
    }
}

function sendMessage() {
  const input = document.querySelector('#message-input');
  const message = input.value.trim();
  if (message) {
    const messageData = {
      room: currentRoom,
      author: username,
      message,
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
  
  // Handlers for edit/delete/forward
  const isDeleted = data.isDeleted || data.message === '🚫 This message was deleted';
  const isEdited = data.isEdited;

  const messageElement = document.createElement('div');
  messageElement.classList.add('message', isOwn ? 'own' : 'other');
  if (isDeleted) messageElement.classList.add('deleted');
  messageElement.setAttribute('data-id', data._id);

  let contentHtml = `<div class="message-content">${data.message || ''}${isEdited ? '<span class="edited-tag">(edited)</span>' : ''}</div>`;
  
  if (data.file && !isDeleted) {
    if (data.fileType === 'shot') {
        contentHtml = `<div class="message-content shot-content" style="cursor:pointer; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 10px; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.5rem;">📸</span>
            <span>${isOwn ? 'Sent a shot' : 'Tap to view shot'}</span>
        </div>`;
    } else if (data.fileType.startsWith('image/')) {
      contentHtml = `<div class="message-content"><img src="${data.file}" style="max-width: 250px; border-radius: 12px; box-shadow: var(--shadow-md);" alt="${data.fileName}" /></div>`;
    } else {
      contentHtml = `<div class="message-content"><a href="${data.file}" download="${data.fileName}" style="color:var(--accent-color); font-weight:600; text-decoration:none;">📄 ${data.fileName}</a></div>`;
    }
  }

  messageElement.innerHTML = `
    <div class="message-meta">
      <span>${isOwn ? 'You' : data.author}</span>
      <div style="display:flex; align-items:center; gap:5px;">
        <span style="font-weight:normal; font-size:0.85em; opacity:0.6;">${data.time}</span>
        ${isOwn ? `<span class="read-status ${data.read ? 'read' : ''}">${data.read ? '✓✓' : '✓'}</span>` : ''}
      </div>
    </div>
    ${contentHtml}
  `;

  // Right click / Long press for context menu
  const handleContextMenu = (e) => {
      e.preventDefault();
      if (isDeleted) return;
      selectedMessageId = data._id;
      selectedMessageText = data.message;
      selectedMessageData = data;
      
      const editBtn = document.querySelector('#cm-edit');
      const deleteBtn = document.querySelector('#cm-delete');
      
      if (isOwn) {
          editBtn.style.display = 'flex';
          deleteBtn.style.display = 'flex';
      } else {
          editBtn.style.display = 'none';
          deleteBtn.style.display = 'none';
      }
      
      contextMenu.style.top = `${e.clientY}px`;
      contextMenu.style.left = `${e.clientX}px`;
      contextMenu.classList.add('active');
  };

  messageElement.addEventListener('contextmenu', handleContextMenu);
  
  // Shot View Logic
  if (data.fileType === 'shot' && !isDeleted) {
      messageElement.addEventListener('click', () => {
          if (isOwn) return;
          showShot(data.file, data._id);
      });
  }

  messageList.appendChild(messageElement);
  if (!container) {
    setTimeout(() => { messageList.scrollTop = messageList.scrollHeight; }, 10);
  }
}

function showShot(url, id) {
    const img = shotViewer.querySelector('.shot-image');
    const timer = shotViewer.querySelector('.shot-timer');
    img.src = url;
    shotViewer.classList.add('active');
    
    let count = 10;
    timer.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        timer.textContent = count;
        if (count <= 0) {
            clearInterval(interval);
            shotViewer.classList.remove('active');
            socket.emit('mark_read', { room: currentRoom, username });
        }
    }, 1000);
}

const themeToggleBtn = document.createElement('button');
themeToggleBtn.classList.add('theme-toggle');
themeToggleBtn.innerHTML = '🌙';
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

const savedTheme = localStorage.getItem('theme') || 'dark';
document.body.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);
themeToggleBtn.addEventListener('click', toggleTheme);

socket.on('connect', () => {
  if (username) {
    socket.emit('login', username);
    socket.emit('join_room', currentRoom);
  }
});

socket.on('receive_message', (data) => {
  if (data.room === currentRoom) {
    addMessageToUI(data, false);
    socket.emit('mark_read', { room: currentRoom, username });
  }
});

socket.on('message_edited', ({ messageId, newMessage, room }) => {
    if (room === currentRoom) {
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            const content = msgEl.querySelector('.message-content');
            if (content) {
                content.innerHTML = `${newMessage}<span class="edited-tag">(edited)</span>`;
            }
        }
    }
});

socket.on('message_deleted', ({ messageId, room }) => {
    if (room === currentRoom) {
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            msgEl.classList.add('deleted');
            const content = msgEl.querySelector('.message-content');
            if (content) content.innerHTML = '🚫 This message was deleted';
        }
    }
});

socket.on('global_read_update', ({ room, reader }) => {
    if (room === currentRoom) {
        document.querySelectorAll('.message.own .read-status').forEach(el => {
            el.textContent = '✓✓';
            el.classList.add('read');
        });
    }
});

let typingTimeout;
socket.on('user_typing', (data) => {
  const typingEl = document.querySelector('#typing-indicator');
  if (typingEl) {
    typingEl.textContent = `${data.user} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { typingEl.textContent = ''; }, 3000);
  }
});

socket.on('messages_read', ({ room }) => {
  if (room === currentRoom) {
    document.querySelectorAll('.read-status').forEach(el => { 
        el.textContent = '✓✓'; 
        el.classList.add('read');
    });
  }
});

socket.on('load_messages', (messages) => {
  const messageList = document.querySelector('#message-list');
  if (messageList) {
    messageList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    // Find first unread message
    let firstUnreadId = null;
    for (const msg of messages) {
        if (msg.author !== username && !msg.read) {
            firstUnreadId = msg._id;
            break;
        }
    }

    messages.forEach(msg => { 
        if (msg._id === firstUnreadId) {
            const sep = document.createElement('div');
            sep.className = 'unread-separator';
            sep.innerHTML = '<span>New Messages Below</span>';
            fragment.appendChild(sep);
        }
        addMessageToUI(msg, msg.author === username, fragment); 
    });
    
    messageList.appendChild(fragment);
    
    // Scroll to unread or bottom
    if (firstUnreadId) {
        const unreadEl = messageList.querySelector('.unread-separator');
        if (unreadEl) unreadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        messageList.scrollTop = messageList.scrollHeight;
    }
    
    socket.emit('mark_read', { room: currentRoom, username });
  }
});

renderLogin();

window.switchRoom = switchRoom;
window.startPrivateChat = startPrivateChat;
window.toggleSidebar = toggleSidebar;
