// ============================================
// CONFIGURATION - NO HARDCODED API KEYS!
// ============================================

// Auto-detect Flask backend URL (works in dev and production)
const FLASK_BASE_URL = window.location.origin;

// State variables
let chartInstance = null;
let isAnalyzing = false;
let isSearching = false;
let isChatting = false;
let chatHistory = []; // Stores the ongoing conversation for context
let lastAnalysisData = null; // Stores the latest successful analysis JSON array
let activeCharacter = null; // Tracks the character currently being role-played

// Element references
const storyInput = document.getElementById('storyInput');
const statusMessage = document.getElementById('statusMessage');
const analyzeButton = document.getElementById('analyzeButton');
const analysisOutput = document.getElementById('analysisOutput');

const bookTitleInput = document.getElementById('bookTitleInput');
const findSummaryButton = document.getElementById('findSummaryButton');
const searchStatusMessage = document.getElementById('searchStatusMessage');
const summaryOutput = document.getElementById('summaryOutput');
const summaryTextarea = document.getElementById('summaryTextarea');
const analysisOutputSummary = document.getElementById('analysisOutputSummary');

const chatOutput = document.getElementById('chatOutput');
const chatInput = document.getElementById('chatInput');
const sendChatButton = document.getElementById('sendChatButton');
const chatStatusMessage = document.getElementById('chatStatusMessage');
const characterSlots = document.getElementById('characterSlots');

const aboutView = document.getElementById('aboutView'); 
const downloadDataButton = document.getElementById('downloadDataButton'); 

// Views mapping
const views = {
    analysis: document.getElementById('analysisView'),
    chat: document.getElementById('chatView'),
    about: aboutView,
};

const navItems = document.querySelectorAll('.nav-item');

// ============================================
// VIEW MANAGEMENT
// ============================================

window.switchView = function(viewName) {
    // Hide all views
    Object.keys(views).forEach(key => {
        views[key].classList.add('hidden');
    });

    // Show the requested view
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
    }

    // Update active state in sidebar
    navItems.forEach(item => {
        item.classList.remove('active-nav-item', 'bg-slate-700'); 
    });
    const activeNavButton = document.querySelector(`.nav-item[onclick="switchView('${viewName}')"]`);
    if (activeNavButton) {
        activeNavButton.classList.add('active-nav-item', 'bg-slate-700');
    }

    // If switching to Chat, scroll to the bottom of the conversation
    if (viewName === 'chat') {
        setTimeout(() => {
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }, 50);
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Simple fetch wrapper with error handling
 */
async function fetchAPI(endpoint, payload) {
    const response = await fetch(`${FLASK_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
    }
    
    return data;
}

/**
 * Triggers a download of the last successful analysis data as a JSON file.
 */
window.downloadAnalysisData = function() {
    if (!lastAnalysisData) {
        alert("Please run a successful story analysis first.");
        return;
    }

    try {
        const jsonString = JSON.stringify(lastAnalysisData, null, 2); 
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `story-analysis-${date}.json`; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert("Analysis data download started!");

    } catch (e) {
        console.error("Download error:", e);
        alert("Failed to generate or download the JSON file.");
    }
}

// ============================================
// 1. CONTENT ACQUISITION (SEARCH EXCERPTS)
// ============================================

/**
 * Copies the text found in the search output textarea to the main analysis input area.
 */
window.copySummaryToInput = function() {
    storyInput.value = summaryTextarea.value;
    summaryOutput.classList.add('hidden');
    searchStatusMessage.textContent = 'Excerpt copied! Ready for Step 2.';
}

/**
 * Searches for a specific literary passage using Flask backend.
 */
window.findBookSummary = async function() {
    if (isSearching) return;
    
    const query = bookTitleInput.value.trim();
    if (query.length < 5) {
        searchStatusMessage.textContent = "Please enter a title and a specific section (e.g., 'Chapter 5 of Dracula').";
        searchStatusMessage.classList.add('text-red-600');
        return;
    }
    searchStatusMessage.classList.remove('text-red-600');

    isSearching = true;
    findSummaryButton.disabled = true;
    summaryOutput.classList.add('hidden');
    searchStatusMessage.textContent = `Searching for "${query}"...`;

    try {
        const result = await fetchAPI('/search_excerpt', { query });
        
        if (result.excerpt) {
            summaryTextarea.value = result.excerpt.trim();
            summaryOutput.classList.remove('hidden');
            searchStatusMessage.textContent = 'Excerpt found! Review the text below and copy it for analysis.';
            
            // Display sources if available
            if (result.sources && result.sources.length > 0) {
                const sourcesHtml = result.sources.map(s => 
                    `<a href="${s.uri}" target="_blank" class="text-blue-600 text-xs">${s.title}</a>`
                ).join(' | ');
                searchStatusMessage.innerHTML = `Excerpt found! Sources: ${sourcesHtml}`;
            }
        } else {
            searchStatusMessage.textContent = 'Could not find that specific excerpt. Try a different query.';
        }

    } catch (error) {
        console.error("Search error:", error);
        searchStatusMessage.textContent = `Search failed: ${error.message}`;
        searchStatusMessage.classList.add('text-red-600');
    } finally {
        isSearching = false;
        findSummaryButton.disabled = false;
    }
};

// ============================================
// 2. STORY ANALYSIS
// ============================================

/**
 * Initializes or re-initializes the Chart.js line graph.
 */
function initializeChart() {
    const ctx = document.getElementById('tensionChart').getContext('2d');
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Start', 'Point 1', 'Point 2', 'Midpoint', 'Point 4', 'Point 5', 'Climax/End'],
            datasets: [{
                label: 'Emotional Tension Score (1-100)',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: 'rgb(30, 64, 175)',
                backgroundColor: 'rgba(30, 64, 175, 0.2)',
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: 'rgb(30, 64, 175)',
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Tension (0 - 100)' }
                },
                x: {
                    title: { display: true, text: 'Story Progress' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => context.dataset.label + ': ' + context.parsed.y
                    }
                }
            }
        }
    });
}

/**
 * Updates the UI with the analysis data, drawing the chart and creating the metric cards.
 */
function updateUI(analysisData, characters) { 
    // 1. Update Chart Data (Primary Metric: Tension)
    const scores = analysisData.map(item => item.TensionScore);
    chartInstance.data.datasets[0].data = scores;
    chartInstance.update();

    // Helper function for metric card colors
    const getMetricColor = (score) => score > 80 ? 'text-red-600' : score > 50 ? 'text-amber-600' : 'text-green-600';

    // 2. Render the detailed analysis (horizontal cards)
    analysisOutput.innerHTML = analysisData.map((item, index) => {
        const cardBorderColor = item.TensionScore > 70 ? 'border-red-500' : item.TensionScore > 40 ? 'border-amber-500' : 'border-green-500';

        return `
            <div class="analysis-card bg-white p-4 space-y-3 border-t-4 ${cardBorderColor}">
                
                <div class="border-b pb-2">
                    <h4 class="font-extrabold text-lg text-primary-dark">Point ${index + 1}</h4>
                    <p class="text-xs text-gray-500">${chartInstance.data.labels[index]}</p>
                </div>

                <div class="space-y-1">
                    <p class="text-sm"><strong>Event:</strong> ${item.keyEvent}</p>
                    <p class="text-sm"><strong>Focus:</strong> ${item.characterFocus}</p>
                </div>

                <div class="space-y-2 pt-2 border-t border-gray-100">
                    ${[
                        { label: 'Tension', score: item.TensionScore, summary: item.TensionSummary, icon: '⚡' },
                        { label: 'Pacing', score: item.PacingScore, summary: item.PacingSummary, icon: '⏱️' },
                        { label: 'Agency', score: item.AgencyScore, summary: item.AgencySummary, icon: '💡' },
                        { label: 'Resonance', score: item.ResonanceScore, summary: item.ResonanceSummary, icon: '❤️' }
                    ].map(metric => `
                        <div class="flex flex-col">
                            <div class="flex items-center space-x-2">
                                <span class="text-sm font-semibold text-primary-dark">${metric.icon} ${metric.label}:</span>
                                <span class="text-lg font-extrabold ${getMetricColor(metric.score)}">${metric.score}</span>
                            </div>
                            <p class="text-xs text-gray-500 italic ml-4">${metric.summary}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    // 3. Update the summary panel
    analysisOutputSummary.innerHTML = `
        <h3 class="text-lg font-bold text-primary-blue mb-2">Last Analysis Key Points:</h3>
        <p class="text-sm text-gray-700"><strong>Conflict:</strong> ${analysisData[0].keyEvent}</p>
        <p class="text-sm text-gray-700"><strong>Climax:</strong> ${analysisData[6].keyEvent}</p>
        <p class="text-sm text-gray-700 mt-2"><strong>Avg. Tension:</strong> ${Math.round(scores.reduce((a, b) => a + b) / scores.length)}/100</p>
        <p class="text-sm text-gray-700"><strong>Main Character:</strong> ${analysisData[0].characterFocus}</p>
        <button id="downloadDataButton" onclick="downloadAnalysisData()" class="mt-4 w-full px-4 py-2 bg-accent-green text-white font-semibold rounded-lg hover:bg-green-700 transition duration-200">
            Download Analysis Data (JSON)
        </button>
    `;
    
    const downloadButton = document.getElementById('downloadDataButton');
    if(downloadButton) downloadButton.disabled = false;

    // 4. Render character slots
    if (characters.length > 0) {
        renderCharacterSlots(characters);
        chatStatusMessage.textContent = 'Character list loaded. Click an icon to start chatting!';
    } else {
        chatStatusMessage.textContent = 'Ready to chat, but no specific characters were identified in the text.';
        setActiveCharacter(null);
    }

    statusMessage.textContent = 'Analysis complete! 4-Dimensional metrics mapped and chat enabled. Switch to the Chat tab to talk to your characters.';
    
    // Enable chat controls
    chatHistory = [];
    chatInput.value = '';
    chatInput.disabled = false;
    sendChatButton.disabled = false;
    chatOutput.innerHTML = '<p class="text-center text-sm text-gray-500 italic">Chat mode is active. Select a character icon to begin!</p>';
}

/**
 * Initiates the analysis process using Flask backend.
 */
window.handleAnalysis = async function() {
    if (isAnalyzing) return;
    
    const storyText = storyInput.value.trim();
    if (storyText.length < 100) {
        statusMessage.textContent = "Error: Please enter a longer story (at least 100 characters) for a meaningful analysis.";
        statusMessage.classList.add('text-red-600');
        return;
    }
    statusMessage.classList.remove('text-red-600');

    isAnalyzing = true;
    analyzeButton.disabled = true;
    statusMessage.textContent = 'Analyzing story across 4 dimensions... Please wait.';
    
    lastAnalysisData = null;
    chatInput.disabled = true;
    sendChatButton.disabled = true;
    if(downloadDataButton) downloadDataButton.disabled = true;

    try {
        // 1. Call Flask /analyze endpoint
        const result = await fetchAPI('/analyze', { text: storyText });
        const analysisData = JSON.parse(result.analysis);
        
        if (!Array.isArray(analysisData) || analysisData.length !== 7) {
            throw new Error(`Analysis structure error: Expected 7 items, got ${analysisData.length}.`);
        }
        
        lastAnalysisData = analysisData;
        
        // 2. Call Flask /extract_characters endpoint
        const charResult = await fetchAPI('/extract_characters', { text: storyText });
        const characters = charResult.characters || [];
        
        // 3. Update UI with both results
        updateUI(analysisData, characters);

    } catch (error) {
        console.error("Critical analysis error:", error);
        analysisOutput.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg analysis-card min-w-full">Error: ${error.message}</div>`;
        statusMessage.textContent = 'Analysis failed.';
        statusMessage.classList.add('text-red-600');
        
        chatInput.disabled = true;
        sendChatButton.disabled = true;

    } finally {
        isAnalyzing = false;
        analyzeButton.disabled = false;
    }
};

// ============================================
// 3. CHARACTER CHAT
// ============================================

/**
 * Helper: Gets a detailed emoji based on the character's name.
 */
function getCharacterIcon(name) {
    const lowerName = name.toLowerCase();
    
    // Antagonists/Monsters/Villains
    if (lowerName.includes('monster') || lowerName.includes('dracula') || lowerName.includes('hyde') || lowerName.includes('villain')) return '🦹'; 
    
    // Roles/Archetypes
    if (lowerName.includes('detective') || lowerName.includes('sherlock')) return '🕵️';
    if (lowerName.includes('narrator') || lowerName.includes('author') || lowerName.includes('writer')) return '✍️';
    
    // Age/Archetypes
    if (lowerName.includes('old') || lowerName.includes('elder') || lowerName.includes('grand')) return '👴'; 
    
    // Gender
    if (lowerName.includes('girl') || lowerName.includes('woman') || lowerName.includes('lady') || lowerName.includes('jane') || lowerName.includes('mary')) {
        return '👩‍🦱';
    }
    if (lowerName.includes('boy') || lowerName.includes('man') || lowerName.includes('john') || lowerName.includes('mr.')) {
        return '🧔';
    }
    
    return '🧑'; 
}

/**
 * Renders the character icons (slots) to the UI.
 */
function renderCharacterSlots(characters) {
    if (!characterSlots) return;

    characterSlots.innerHTML = '';
    
    characters.forEach(name => {
        const icon = document.createElement('button');
        const emoji = getCharacterIcon(name);
        
        icon.className = 'character-icon px-3 py-2 mr-2 mb-2 rounded-full text-base font-semibold border-2 border-slate-300 transition-colors duration-200 hover:bg-slate-200 flex items-center space-x-2';
        icon.innerHTML = `<span class="text-2xl leading-none">${emoji}</span><span>${name}</span>`; 
        icon.onclick = () => setActiveCharacter(name);
        
        characterSlots.appendChild(icon);
    });

    if (characters.length > 0) {
        setActiveCharacter(characters[0]);
    }
}

/**
 * Sets the currently active character for role-playing.
 */
function setActiveCharacter(name) {
    activeCharacter = name;
    
    chatHistory = []; 
    chatOutput.innerHTML = `<p class="text-center text-sm text-gray-500 italic">Now chatting as ${name}. Ask them about the story context!</p>`;
    
    document.querySelectorAll('.character-icon').forEach(icon => {
        if (icon.textContent.includes(name)) {
            icon.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            icon.classList.remove('bg-white', 'text-slate-800', 'border-slate-300');
        } else {
            icon.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            icon.classList.add('bg-white', 'text-slate-800', 'border-slate-300');
        }
    });

    chatInput.focus();
}

/**
 * Renders a chat message to the UI.
 */
function renderMessage(role, text) {
    const isUser = role === 'user';
    const bgColor = isUser ? 'bg-blue-50' : 'bg-gray-100';
    const alignment = isUser ? 'self-end' : 'self-start';
    const characterName = isUser ? 'You' : activeCharacter || 'Character AI';

    const messageHtml = `
        <div class="flex flex-col ${alignment} max-w-xs md:max-w-lg my-2">
            <span class="text-xs font-semibold text-gray-500 mb-1">${characterName}</span>
            <div class="p-3 rounded-xl ${bgColor} shadow-sm">
                <p class="text-sm text-gray-800">${text}</p>
            </div>
        </div>
    `;
    chatOutput.innerHTML += messageHtml;
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

/**
 * Handles sending a message to the character AI using Flask backend.
 */
window.handleChat = async function() {
    if (isChatting || chatInput.disabled) return;

    const userText = chatInput.value.trim();
    const storyContext = storyInput.value.trim();

    if (!userText) return;
    if (!storyContext) {
        chatStatusMessage.textContent = "Error: Please run a successful analysis first to provide character context!";
        return;
    }
    
    if (!activeCharacter) {
        chatStatusMessage.textContent = "Error: Please select a character icon to start chatting!";
        return;
    }

    // Add user message to history and UI
    chatHistory.push({ role: "user", parts: [{ text: userText }] });
    renderMessage('user', userText);
    chatInput.value = '';

    isChatting = true;
    sendChatButton.disabled = true;
    chatStatusMessage.textContent = `${activeCharacter} is thinking...`;

    try {
        const result = await fetchAPI('/chat', {
            story: storyContext,
            history: chatHistory,
            activeCharacter: activeCharacter
        });
        
        if (result.response) {
            chatHistory.push({ role: "model", parts: [{ text: result.response }] });
            renderMessage('model', result.response);
            chatStatusMessage.textContent = 'Response received.';
        } else {
            chatStatusMessage.textContent = 'Error: No valid response from the character AI.';
        }
    } catch (error) {
        console.error("Chat error:", error);
        chatStatusMessage.textContent = `Chat failed: ${error.message}`;
        chatStatusMessage.classList.add('text-red-600');
    } finally {
        isChatting = false;
        sendChatButton.disabled = false;
        chatInput.focus();
    }
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeChart();
    window.switchView('analysis');

    // Allow user to send chat message by pressing Enter
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !isChatting) {
            window.handleChat();
        }
    });
});