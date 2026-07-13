import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const EPISODE_ID = "podcast-principal";
const EPISODE_FILE = "./Grupo 8.mp3";
const DOWNLOAD_FILE_NAME = "Grupo 8.mp3";

const media = document.querySelector("#podcast-media");
const seekBar = document.querySelector("#seek-bar");
const currentTimeLabel = document.querySelector("#current-time");
const totalTimeLabel = document.querySelector("#total-time");
const playBtn = document.querySelector("#play-btn");
const rewindBtn = document.querySelector("#rewind-btn");
const forwardBtn = document.querySelector("#forward-btn");
const downloadBtn = document.querySelector("#download-btn");

const loginBtn = document.querySelector("#login-btn");
const logoutBtn = document.querySelector("#logout-btn");
const authStatus = document.querySelector("#auth-status");
const firebaseWarning = document.querySelector("#firebase-warning");
const commentForm = document.querySelector("#comment-form");
const commentInput = document.querySelector("#comment-input");
const submitBtn = document.querySelector("#submit-btn");
const commentsList = document.querySelector("#comments-list");
const commentsEmpty = document.querySelector("#comments-empty");

let auth = null;
let db = null;
let provider = null;
let currentUser = null;
let unsubscribeComments = null;

setupPlayer();
setupFirebase();
setupDownload();

function setupPlayer() {
  playBtn.addEventListener("click", togglePlayback);
  rewindBtn.addEventListener("click", () => jumpTime(-15));
  forwardBtn.addEventListener("click", () => jumpTime(30));

  media.addEventListener("loadedmetadata", updateTimeline);
  media.addEventListener("timeupdate", updateTimeline);
  media.addEventListener("ended", syncPlayButton);
  media.addEventListener("play", syncPlayButton);
  media.addEventListener("pause", syncPlayButton);

  seekBar.addEventListener("input", () => {
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    if (!duration) {
      return;
    }

    media.currentTime = (Number(seekBar.value) / 100) * duration;
    paintSeekBar();
    updateTimeline();
  });

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    const typingInField = activeTag === "TEXTAREA" || activeTag === "INPUT";

    if (typingInField) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    }

    if (event.code === "ArrowLeft") {
      event.preventDefault();
      jumpTime(-15);
    }

    if (event.code === "ArrowRight") {
      event.preventDefault();
      jumpTime(30);
    }
  });

  updateTimeline();
}

function togglePlayback() {
  if (media.paused) {
    media.play().catch((error) => {
      console.error(error);
    });
    return;
  }

  media.pause();
}

function jumpTime(seconds) {
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  const nextTime = Math.min(Math.max(media.currentTime + seconds, 0), duration || media.currentTime + seconds);
  media.currentTime = nextTime;
  updateTimeline();
}

function updateTimeline() {
  const currentTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  seekBar.value = String(progress);
  currentTimeLabel.textContent = formatTime(currentTime);
  totalTimeLabel.textContent = formatTime(duration);
  paintSeekBar();
  syncPlayButton();
}

function paintSeekBar() {
  const progress = Number(seekBar.value);
  seekBar.style.background = `linear-gradient(90deg, var(--accent) ${progress}%, #f0d8ca ${progress}%)`;
}

function syncPlayButton() {
  playBtn.textContent = media.paused ? "Reproducir" : "Pausar";
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setupDownload() {
  downloadBtn.addEventListener("click", downloadEpisode);
}

async function downloadEpisode() {
  const originalLabel = downloadBtn.textContent;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Preparando descarga...";

  try {
    const fileBlob = await fetchEpisodeBlob();

    if ("showSaveFilePicker" in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: DOWNLOAD_FILE_NAME,
        types: [
          {
            description: "Archivo MP3",
            accept: {
              "audio/mpeg": [".mp3"],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(fileBlob);
      await writable.close();
      return;
    }

    triggerBlobDownload(fileBlob);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      window.open(EPISODE_FILE, "_blank", "noopener");
    }
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = originalLabel;
  }
}

async function fetchEpisodeBlob() {
  const response = await fetch(EPISODE_FILE);

  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo: ${response.status}`);
  }

  return response.blob();
}

function triggerBlobDownload(fileBlob) {
  const objectUrl = URL.createObjectURL(fileBlob);
  const tempLink = document.createElement("a");

  tempLink.href = objectUrl;
  tempLink.download = DOWNLOAD_FILE_NAME;
  document.body.appendChild(tempLink);
  tempLink.click();
  tempLink.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function setupFirebase() {
  const config = window.FIREBASE_CONFIG;
  const isConfigured =
    config &&
    typeof config.apiKey === "string" &&
    config.apiKey.trim() !== "" &&
    !config.apiKey.includes("REEMPLAZAR");

  if (!isConfigured) {
    firebaseWarning.classList.remove("hidden");
    loginBtn.disabled = true;
    authStatus.textContent = "El reproductor ya funciona. Para comentarios, primero configurá Firebase.";
    return;
  }

  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  loginBtn.addEventListener("click", handleGoogleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  commentForm.addEventListener("submit", handleCommentSubmit);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI();

    if (unsubscribeComments) {
      unsubscribeComments();
      unsubscribeComments = null;
    }

    subscribeToComments();
  });

  subscribeToComments();
}

async function handleGoogleLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    authStatus.textContent = "No se pudo iniciar sesión con Google. Revisá que el popup no esté bloqueado.";
    console.error(error);
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (error) {
    authStatus.textContent = "No se pudo cerrar la sesión.";
    console.error(error);
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();

  if (!currentUser || !db) {
    authStatus.textContent = "Necesitás iniciar sesión para comentar.";
    return;
  }

  const text = commentInput.value.trim();
  if (!text) {
    authStatus.textContent = "Escribí un comentario antes de publicar.";
    return;
  }

  submitBtn.disabled = true;

  try {
    await addDoc(collection(db, "episodes", EPISODE_ID, "comments"), {
      text,
      episodeId: EPISODE_ID,
      userId: currentUser.uid,
      userName: currentUser.displayName || "Usuario",
      userEmail: currentUser.email || "",
      userPhoto: currentUser.photoURL || "",
      createdAt: serverTimestamp(),
    });

    commentInput.value = "";
    authStatus.textContent = "Comentario publicado.";
  } catch (error) {
    authStatus.textContent = "No se pudo guardar el comentario. Revisá Firestore y las reglas de seguridad.";
    console.error(error);
  } finally {
    submitBtn.disabled = !currentUser;
  }
}

function subscribeToComments() {
  if (!db) {
    return;
  }

  const commentsQuery = query(
    collection(db, "episodes", EPISODE_ID, "comments"),
    orderBy("createdAt", "desc"),
    limit(50),
  );

  unsubscribeComments = onSnapshot(
    commentsQuery,
    (snapshot) => {
      const comments = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));

      renderComments(comments);
    },
    (error) => {
      authStatus.textContent = "No se pudieron cargar los comentarios.";
      console.error(error);
    },
  );
}

function updateAuthUI() {
  const loggedIn = Boolean(currentUser);

  commentInput.disabled = !loggedIn;
  submitBtn.disabled = !loggedIn;

  if (loggedIn) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    authStatus.textContent = `Conectado como ${currentUser.displayName || currentUser.email}.`;
    return;
  }

  loginBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");
  authStatus.textContent = "Iniciá sesión con Google para dejar un comentario.";
}

function renderComments(comments) {
  commentsList.innerHTML = "";
  commentsEmpty.style.display = comments.length ? "none" : "block";

  for (const comment of comments) {
    const item = document.createElement("li");
    item.className = "comment-item";

    const top = document.createElement("div");
    top.className = "comment-top";

    if (comment.userPhoto) {
      const avatar = document.createElement("img");
      avatar.className = "comment-avatar";
      avatar.alt = "";
      avatar.src = comment.userPhoto;
      top.appendChild(avatar);
    } else {
      const avatar = document.createElement("div");
      avatar.className = "comment-avatar comment-avatar-fallback";
      avatar.textContent = buildInitials(comment.userName);
      top.appendChild(avatar);
    }

    const header = document.createElement("div");

    const meta = document.createElement("span");
    meta.className = "comment-meta";
    meta.textContent = "Comentario";

    const name = document.createElement("p");
    name.className = "comment-name";
    name.textContent = comment.userName || "Usuario";

    const date = document.createElement("p");
    date.className = "comment-date";
    date.textContent = formatCommentDate(comment.createdAt);

    header.append(meta, name, date);
    top.appendChild(header);

    const body = document.createElement("p");
    body.className = "comment-text";
    body.textContent = comment.text || "";

    item.append(top, body);
    commentsList.appendChild(item);
  }
}

function formatCommentDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) {
    return "Recién publicado";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildInitials(name) {
  return (name || "Usuario")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}
