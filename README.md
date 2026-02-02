# SG-Traffic-Agent: Intelligent Singapore Traffic Monitoring

**SG-Traffic-Agent** is an AI-powered traffic monitoring platform for Singapore. It integrates real-time camera feeds from LTA DataMall and utilizes Google Gemini AI for scene analysis, providing users with intuitive, real-time traffic assessments.

## 🌟 Key Features

- 📸 **Real-time Traffic**: Access live CCTV feeds from major expressways across Singapore.
- 🤖 **AI-Powered Analysis**: Automatically score and describe traffic conditions using Google Gemini AI.
- 🗺️ **Interactive Map**: A Leaflet-based visualization that dynamically updates road segments based on congestion levels.
- 📦 **Efficient Persistence**: Uses IndexedDB to cache analysis results, preserving data even after page refreshes.
- ⚡ **CORS Proxy**: Built-in multi-strategy proxy fallback ensures reliable camera image loading.

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+ recommended)
- **Gemini API Key** (Obtain from [Google AI Studio](https://aistudio.google.com/))

### Installation
1. **Navigate to Dev Directory**: `cd 0_development/SG-Traffic-Agent`
2. **Install Dependencies**: `npm install`
3. **Configure API Key**: Set `VITE_GEMINI_API_KEY` in `.env.local`
4. **Run the App**: `npm run dev`

---

*Designed for safety and efficiency on Singapore roads.*
