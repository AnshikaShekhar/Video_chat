const socket = io();

const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const status = document.getElementById('status');
const spinner = document.getElementById('spinner');
const userCount = document.getElementById('userCount');
const copyBtn = document.getElementById('copyBtn');
const toggleCamera = document.getElementById('toggleCamera');
const toggleMic = document.getElementById('toggleMic');
const endCall = document.getElementById('endCall');
const startChatBtn = document.getElementById('startChatBtn');
const clock = document.getElementById('clock');
const notification = document.getElementById('notification');

let localStream;
let peerConnection;
let roomID;
let videoEnabled = true;
let audioEnabled = true;

const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error'}`;
  notification.style.display = 'block';
  setTimeout(() => {
    notification.classList.add('animate__fadeOut');
    setTimeout(() => {
      notification.style.display = 'none';
      notification.classList.remove('animate__fadeOut');
    }, 500);
  }, 3000);
}

// Start Chatting Now functionality
startChatBtn.onclick = () => {
  document.querySelector('.landing-overlay').classList.add('hidden');
  document.getElementById('chatSection').classList.remove('hidden');

  roomID = "default-room";
  roomInput.value = roomID;
  showNotification('Default room set. Edit and join or click Join.', 'warning');
  // Do not disable input or join immediately; let user edit
};

joinBtn.onclick = async () => {
  roomID = roomInput.value.trim();
  if (!roomID) {
    showNotification('Please enter a room ID', 'error');
    return;
  }
  await joinRoom();
};

async function joinRoom() {
  roomInput.disabled = true;
  joinBtn.disabled = true;
  copyBtn.classList.remove('hidden');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(roomID);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy ID'), 1500);
  };

  socket.emit('join-room', roomID);
  status.textContent = `Joining room: ${roomID}`;
  showNotification(`Joining room: ${roomID}`, 'success');

  spinner.classList.remove('hidden');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.classList.toggle('muted', !audioEnabled); // Set initial mic state

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      spinner.classList.add('hidden');
      status.textContent = `Connected to room: ${roomID}`;
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };
  } catch (err) {
    console.error('Error accessing media devices:', err);
    status.textContent = 'Failed to access camera/microphone';
    spinner.classList.add('hidden');
    roomInput.disabled = false;
    joinBtn.disabled = false;
    copyBtn.classList.add('hidden');
    showNotification('Failed to join room', 'error');
  }
}

socket.on('user-connected', async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { offer, roomID });
});

socket.on('offer', async ({ offer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer, roomID });
});

socket.on('answer', async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ candidate }) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
});

socket.on('user-disconnected', () => {
  status.textContent = 'User left the room';
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }
  spinner.classList.remove('hidden');
  showNotification('Peer left the chat', 'warning');
});

socket.on('connect', () => {
  userCount.textContent = 'Connected: 1';
});

socket.on('disconnect', () => {
  userCount.textContent = 'Connected: 0';
  if (roomInput) {
    roomInput.disabled = false;
    joinBtn.disabled = false;
    copyBtn.classList.add('hidden');
    status.textContent = 'Disconnected';
    showNotification('Disconnected from server', 'warning');
  }
});

// Toggle camera
toggleCamera.onclick = async () => {
  videoEnabled = !videoEnabled;
  if (localStream && peerConnection) {
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0 && !videoEnabled) {
      videoTracks[0].stop();
      localStream.removeTrack(videoTracks[0]);
      localVideo.srcObject = localStream;
      await renegotiateConnection();
      showNotification('Camera turned off', 'warning');
    } else if (videoEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: audioEnabled });
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        localStream = newStream;
        localVideo.srcObject = localStream;
        peerConnection.getSenders().forEach(sender => peerConnection.removeTrack(sender));
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        await renegotiateConnection();
        showNotification('Camera turned on', 'success');
      } catch (err) {
        console.error('Error re-enabling camera:', err);
        status.textContent = `Failed to re-enable camera: ${err.name || err.message}`;
        videoEnabled = false;
        showNotification('Failed to turn on camera', 'error');
      }
    }
  }
  toggleCamera.textContent = videoEnabled ? 'Turn Off Camera' : 'Turn On Camera';
};

// Toggle mic
toggleMic.onclick = async () => {
  audioEnabled = !audioEnabled;
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      audioTracks[0].enabled = audioEnabled;
      showNotification(audioEnabled ? 'Microphone unmuted' : 'Microphone muted', 'warning');
    } else if (audioEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: videoEnabled, audio: true });
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        localStream = newStream;
        localVideo.srcObject = localStream;
        peerConnection.getSenders().forEach(sender => peerConnection.removeTrack(sender));
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        await renegotiateConnection();
        showNotification('Microphone turned on', 'success');
      } catch (err) {
        console.error('Error re-enabling microphone:', err);
        status.textContent = `Failed to re-enable microphone: ${err.name || err.message}`;
        audioEnabled = false;
        showNotification('Failed to turn on microphone', 'error');
      }
    }
  }
  localVideo.classList.toggle('muted', !audioEnabled);
  toggleMic.textContent = audioEnabled ? 'Mute Mic' : 'Unmute Mic';
};

// End call functionality
endCall.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }
  socket.emit('leave-room', roomID);
  status.textContent = 'Call ended';
  spinner.classList.add('hidden');
  roomInput.disabled = false;
  joinBtn.disabled = false;
  copyBtn.classList.add('hidden');
  localVideo.srcObject = null;
  userCount.textContent = 'Connected: 0';
  showNotification('Chat ended', 'warning');
};

socket.on('user-left', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }
  status.textContent = 'Peer left the call';
  spinner.classList.add('hidden');
  roomInput.disabled = false;
  joinBtn.disabled = false;
  copyBtn.classList.add('hidden');
  showNotification('Peer left the chat', 'warning');
});

// Renegotiate peer connection
async function renegotiateConnection() {
  if (peerConnection && peerConnection.signalingState !== 'closed') {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('offer', { offer, roomID });
    } catch (err) {
      console.error('Error renegotiating connection:', err);
    }
  }
}

// Update clock every second
function updateClock() {
  const now = new Date();
  const options = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
  clock.textContent = now.toLocaleString('en-US', options).replace(',', '');
}
setInterval(updateClock, 1000);
updateClock();