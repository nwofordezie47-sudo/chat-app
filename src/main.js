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
async function loadRooms() {
    const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
    try {
        const res = await fetch(`${serverUrl}/groups/${username}`);
        if (res.ok) {
            userGroups = await res.json();
            updateRoomList();
        }
    } catch (e) {
        console.error("Failed to load groups");
    }
}

function updateRoomList() {
    const roomList = document.querySelector('#room-list');
    if (!roomList) return;
    
    let html = `<p onclick="switchRoom('general')" class="${currentRoom === 'general' ? 'active' : ''}"># General</p>`;
    
    userGroups.forEach(g => {
        html += `<p onclick="switchRoom('${g.name}', true, '${g._id}')" class="${currentRoom === g.name ? 'active' : ''}">
            👥 ${g.name}
        </p>`;
    });
    
    roomList.innerHTML = html;
}

function renderChat() {
  app.innerHTML = `
    <div class="chat-container">
      <aside class="sidebar" id="sidebar">
        <h3>Chats</h3>
        <div id="room-list">
            <p onclick="switchRoom('general')" class="active"># General</p>
        </div>
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
          <div style="display:flex; align-items:center; gap: 15px;">
            <button class="menu-btn" onclick="toggleSidebar()">☰</button>
            <h3 id="chat-title"># general</h3>
          </div>
          <div id="header-actions">
              <!-- Settings icon for groups will appear here -->
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

  document.querySelector('#send-btn').addEventListener('click', sendMessage);
  document.querySelector('#message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  document.querySelector('#file-input').addEventListener('change', handleFileUpload);
  document.querySelector('#message-input').addEventListener('input', () => {
    socket.emit('typing', { room: currentRoom, user: username });
  });
}

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
  if (room === currentRoom && !groupId) return;
  socket.emit('join_room', room);
  currentRoom = room;
  currentGroupId = groupId;
  
  const chatTitle = document.querySelector('#chat-title');
  if (chatTitle) chatTitle.textContent = isGroup ? `👥 ${room}` : `# ${room}`;
  
  const headerActions = document.querySelector('#header-actions');
  if (headerActions) {
      headerActions.innerHTML = isGroup ? `<button id="group-settings-btn" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.2rem;">⚙️</button>` : '';
      if (isGroup) {
          const btn = document.querySelector('#group-settings-btn');
          if (btn) btn.onclick = showGroupSettings;
      }
  }

  const messageList = document.querySelector('#message-list');
  if (messageList) messageList.innerHTML = '';
  
  const serverUrl = import.meta.env.VITE_BACKEND_URL || '';
  try {
    const res = await fetch(`${serverUrl}/messages/${room}`);
    const messages = await res.json();
    socket.emit('load_messages', messages);
    updateRoomList();
  } catch (err) {
    console.error(err);
  }
  
  document.querySelector('#sidebar').classList.remove('active');
  document.querySelector('.sidebar-overlay').classList.remove('active');
}

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

async function showGroupSettings() {
    if (!currentGroupId) return;
    
    const leaveBtn = document.querySelector('#leave-group-btn');
    const deleteBtn = document.querySelector('#delete-group-btn');
    
    groupSettingsOverlay.classList.add('active');
    
    // Simplification: show delete for all members in this demo, but logic is there
    deleteBtn.style.display = 'block'; 
    
    leaveBtn.onclick = async () => {
        if (confirm("Are you sure you want to leave this group?")) {
            await leaveGroup(currentGroupId);
        }
    };
    
    deleteBtn.onclick = async () => {
        if (confirm("DANGER: This will delete the group and all its messages. Proceed?")) {
            await deleteGroup(currentGroupId);
        }
    };
}

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
