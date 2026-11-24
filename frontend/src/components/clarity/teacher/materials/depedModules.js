// R52 (4c): DepEd learning-resource links per grade, for TEACHERS only (Q17).
// Source: EduScribe.xlsx (Nov 23, 2026), sheet "MODULE LINKSUBJECT", cells A1:D32,
// copied as written. Two clean-ups, both logged in DECISIONS-LOG.md:
//   - "TLE_ FCS - Food Service" appears twice in Grade 9 (C16 and C18): listed once;
//   - "FISH CULTIRE" (C11) is shown as "FISH CULTURE".
// The school has Grade 7-10 only (GRADE_LEVELS in lib/academicRules.js).
export const DEPED_MODULES = [
  {
    grade: 'Grade 7',
    url: 'https://sites.google.com/deped.gov.ph/deped-lrportal/three-term-budget-of-work-bow/grade-7?authuser=0',
    subjects: ['Araling Panlipunan', 'English', 'Science', 'Filipino', 'MAPEH', 'Mathematics', 'Values Education', 'TLE ICT'],
  },
  {
    grade: 'Grade 8',
    url: 'https://sites.google.com/deped.gov.ph/deped-lrportal/three-term-budget-of-work-bow/grade-8?authuser=0',
    subjects: ['Araling Panlipunan', 'English', 'Science', 'Filipino', 'MAPEH', 'Mathematics', 'Values Education', 'TLE ICT'],
  },
  {
    grade: 'Grade 9',
    url: 'https://sites.google.com/deped.gov.ph/deped-lrportal/three-term-budget-of-work-bow/grade-9?authuser=0',
    subjects: ['Araling Panlipunan', 'English', 'Science', 'Filipino', 'MAPEH', 'Mathematics', 'Values Education',
      'TLE_AFA- Agriculture Crop Production', 'TLE_AFA-AQUACULTURE (FISH CULTURE)', 'TLE_ AFA - Fish Capture',
      'TLE_ AFA - Food and Beverage Processing', 'TLE_ FCS - Beauty Care Services', 'TLE_ FCS - Food Preparation',
      'TLE_ FCS - Food Service', 'TLE_AFA-Animal Production', 'TLE_ FCS - Handicraft',
      'TLE_ FCS - Health and Wellness Massage', 'TLE_ FCS - Hotel Services', 'TLE_ FCS - Tourism Services',
      'TLE_ ICT - Computer Programming', 'TLE_ ICT - Computer Systems Servicing', 'TLE_ ICT - Telecommunications',
      'TLE_ ICT - Visual Arts', 'TLE_ IA - Automotive and Small Engine Servicing',
      'TLE_ IA - Electrical and Electronics Servicing', 'TLE_ IA - Residential Carpentry',
      'TLE_ IA - Residential Masonry and Tile Setting', 'TLE_ IA - Residential Plumbing',
      'TLE_ IA - Shielded Metal Arc Welding (SMAW)'],
  },
  {
    grade: 'Grade 10',
    url: 'https://sites.google.com/deped.gov.ph/deped-lrportal/three-term-budget-of-work-bow/grade-10?authuser=0',
    subjects: ['Araling Panlipunan', 'English', 'Science', 'Filipino', 'MAPEH', 'Mathematics', 'Values Education',
      'TLE_AFA- Agriculture Crop Production'],
  },
];
