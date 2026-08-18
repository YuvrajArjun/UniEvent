"""Static reference data (was MOCK_CATEGORIES / EVENT_SCOPES / INDIAN_CITIES in
the old frontend's mockData.js). These are UI reference lists, not
user-editable records, so they live in code rather than the database, but are
now served through /api/meta/ so the backend remains the single source of
truth for the frontend.
"""

CATEGORIES = ["Technical", "Cultural", "Workshop", "Sports", "Other"]

SCOPES = ["Intercollege", "Intracollege"]

INDIAN_CITIES = [
    "Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata",
    "Pune", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane",
    "Bhopal", "Visakhapatnam", "Patna", "Vadodara", "Ghaziabad", "Ludhiana", "Agra",
    "Nashik", "Faridabad", "Meerut", "Rajkot", "Kalyan-Dombivli", "Varanasi", "Srinagar",
    "Aurangabad", "Dhanbad", "Amritsar", "Navi Mumbai", "Allahabad (Prayagraj)", "Ranchi",
    "Howrah", "Coimbatore", "Jabalpur", "Gwalior", "Vijayawada", "Jodhpur", "Madurai",
    "Raipur", "Kota", "Chandigarh", "Guwahati", "Solapur", "Hubballi-Dharwad", "Mysuru",
    "Tiruchirappalli", "Bareilly", "Aligarh", "Tiruppur", "Gurugram", "Moradabad", "Jalandhar",
    "Bhubaneswar", "Salem", "Warangal", "Guntur", "Bhiwandi", "Saharanpur", "Gorakhpur",
    "Bikaner", "Amravati", "Noida", "Jamshedpur", "Bhilai", "Cuttack", "Firozabad",
    "Kochi", "Nellore", "Bhavnagar", "Dehradun", "Durgapur", "Asansol", "Rourkela",
    "Nanded", "Kolhapur", "Ajmer", "Akola", "Gulbarga", "Jamnagar", "Ujjain", "Loni",
    "Siliguri", "Jhansi", "Ulhasnagar", "Jammu", "Sangli-Miraj", "Mangaluru", "Erode",
    "Belgaum", "Kurnool", "Rajahmundry", "Tirunelveli", "Malegaon", "Gaya", "Udaipur",
    "Panaji", "Shimla", "Puducherry", "Itanagar", "Imphal", "Shillong", "Agartala",
]
