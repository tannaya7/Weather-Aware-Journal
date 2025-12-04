# 🌥️ Weather Journal App

A modern, accessible client-side web application for creating and managing personal journal entries with integrated weather data. Built with vanilla JavaScript ES6 modules, this application combines journaling with real-time weather information to help you remember the context of your memories.

## ✨ Features

### Core Functionality
- **Create Journal Entries**: Write personal journal entries with titles, dates, moods, and content
- **Real-Time Weather Integration**: Fetch current weather data for any city using the Open-Meteo API
- **Local Storage**: All entries are stored locally in your browser using localStorage
- **Search & Filter**: Search through entries and filter by date
- **Mood Tracking**: Track your emotional state with each entry and view mood summaries
- **Customizable Appearance**: Choose from different background themes and font styles for each entry

### Advanced Features
- **Pagination**: Navigate through entries with paginated views (5 entries per page)
- **Sort Options**: Sort entries by newest or oldest first
- **Delete with Undo**: Remove entries with an undo option using a toast notification
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **Accessibility**: WCAG 2.1 Level AA compliant with full keyboard navigation and screen reader support

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome)
- A local development server (optional, for best experience)

### Installation

1. **Clone or Download the Repository**
   ```bash
   git clone "https://github.com/tannaya7/Weather-Aware-Journal.git"
   cd "OJT PROJECT"
   ```

2. **Open the Application**
   - **Option 1**: Simply open `index.html` in your web browser
   - **Option 2** (Recommended): Use a local development server
     ```bash
     # Using Python 3
     python -m http.server 8000
     
     # Using Node.js (with npx)
     npx http-server
     ```
     Then navigate to `http://localhost:8000` in your browser

## 📁 Project Structure

```
OJT PROJECT/
├── index.html              # Main dashboard page
├── new-entry.html          # Create new entry page
├── style.css               # Main stylesheet
├── js/
│   ├── main.js             # Application entry point
│   ├── storage.js          # LocalStorage management
│   ├── entries.js          # Entry rendering and dashboard interactions
│   ├── form.js             # Form handling and validation
│   ├── weather.js          # Weather API integration
│   ├── utils.js            # Utility functions
│   └── a11y.js             # Accessibility features
└── README.md               # This file
```

## 🎯 How to Use

### Creating a New Entry

1. Click the **"+ New Entry"** button on the dashboard
2. Fill in the required fields:
   - **Title**: A descriptive title for your entry
   - **Date**: Choose the date and time
   - **Mood**: Select how you're feeling
   - **Content**: Write your journal entry
3. **(Optional)** Fetch weather data:
   - Enter a city name in the Location field
   - Click **"Update Weather"** to fetch current weather
4. **(Optional)** Customize appearance:
   - Choose a background theme
   - Select a font style
5. **(Optional)** Add comma-separated tags
6. Click **"Submit Entry"** to save

### Managing Entries

- **Search**: Use the search bar to find entries by title, content, or tags
- **Sort**: Toggle between "Newest First" and "Oldest First"
- **Filter by Date**: Click "Today" to show only today's entries
- **View Mood Summary**: Click "Mood tracker" to see your mood distribution
- **Delete**: Click the delete button on any entry card (undo available for 5 seconds)
- **Pagination**: Navigate through pages using the pagination controls

## 🌐 Weather API

This application uses the free [Open-Meteo API](https://open-meteo.com/) for weather data:
- **Geocoding API**: Converts city names to coordinates
- **Weather Forecast API**: Provides current weather conditions

**No API key required!** The Open-Meteo API is free and doesn't require authentication.

### Weather Data Includes:
- Temperature (°C)
- Weather condition (Clear, Clouds, Rain, Snow, etc.)
- Humidity (%)
- Wind speed (m/s)
- Location name with country

## ♿ Accessibility Features

This application is built with accessibility in mind:

- **Keyboard Navigation**: Full keyboard support with visible focus indicators
- **Screen Reader Support**: Proper ARIA labels and live regions
- **Focus Management**: Modal dialogs trap focus appropriately
- **Form Validation**: Accessible error messages with screen reader announcements
- **Color Contrast**: WCAG AA compliant color ratios
- **Reduced Motion**: Respects user's motion preferences
- **Semantic HTML**: Proper use of HTML5 semantic elements

## 🎨 Customization

### Available Themes
- Default
- Light Blue
- Peach
- Dark Mode

### Available Fonts
- Default (Inter)
- Serif
- Handwritten
- Monospace

## 🔧 Technical Details

### Technologies Used
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with custom properties
- **JavaScript ES6+**: Modular architecture
- **LocalStorage API**: Client-side data persistence
- **Fetch API**: Weather data integration

### Browser Compatibility
- Chrome/Edge (v90+)
- Firefox (v88+)
- Safari (v14+)

### Data Storage
All data is stored locally in your browser's localStorage. No data is sent to any external servers (except for weather API requests).

**Note**: Clearing your browser data will delete all journal entries.

## 🐛 Troubleshooting

### Weather not loading?
- Check your internet connection
- Verify the city name is spelled correctly
- Try a major city name (e.g., "London", "New York", "Tokyo")

### Entries not saving?
- Ensure JavaScript is enabled in your browser
- Check that localStorage is not disabled
- Try using a different browser

### Display issues?
- Clear your browser cache
- Ensure you're using a modern browser
- Try zooming to 100%

## 📝 Future Enhancements

Potential features for future development:
- Export/import journal entries (JSON, PDF)
- Cloud sync with user accounts
- Advanced search with filters
- Data visualization and insights
- Photo attachments
- Weather forecast for future entries

## 📄 License

This project is open source and available for personal and educational use.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or create a pull request.

## 👨‍💻 Author

Built as part of an OJT (On-the-Job Training) project.

## 🙏 Acknowledgments

- Weather data provided by [Open-Meteo](https://open-meteo.com/)
- Icons: Unicode emoji characters
- Inspired by modern journaling and weather apps

---

**Enjoy journaling with weather context! 🌤️📔**
