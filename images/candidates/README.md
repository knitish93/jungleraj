# Candidate Photos

Place the candidate photos in this directory with the following filenames:

1. `narendra-modi.jpg` - Narendra Modi
2. `joseph-vijay.jpg` - C. Joseph Vijay
3. `rahul-gandhi.jpg` - Rahul Gandhi
4. `yogi-adityanath.jpg` - Yogi Adityanath
5. `prashant-kishore.jpg` - Prashant Kishore

## Photo Requirements

- Format: JPG or PNG
- Dimensions: ~110px × 130px (portrait aspect ratio)
- File size: Under 100KB each for optimal loading
- Crop: Should show clear headshot/portrait
- Quality: Use `object-fit: cover` (system handles aspect ratio matching)

## Usage

The featured-surveys.js system will automatically display these images in the PM preference survey on the homepage at:
- Desktop: 4-column grid (2 rows for 7 options)
- Tablet: 2-column grid
- Mobile: 1-column vertical list

The system includes two special options:
- **No one elible**: Displays a red ✕ (cross) symbol
- **Enter your desired name**: Displays a ? (question mark) symbol

All 7 options are fully votable and tracked in localStorage.
