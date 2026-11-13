// ============================================
// FILE: src/pages/about/aboutContent.js
// Everything the About page says, in one place. Real data only: the filled
// fields are copied from text the site already shows (header, footer, the
// home page's vision card, the README). Every empty field is waiting for the
// school; a section of the page appears only once its field is filled.
// ============================================

const aboutContent = {
  // From the header and the footer.
  schoolName: 'Dela Paz National High School',
  tagline: 'Inspiring excellence and shaping futures through quality secondary education in a nurturing environment.',

  // From the README.
  portalSummary: 'An AI-assisted, web-based lesson planning and learning resources management system for Dela Paz National High School.',

  // From the home page's "Our Vision" card.
  vision: [
    'We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.',
    'As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.',
  ],

  // To be provided by the school.
  mission: '',
  story: [], // paragraphs (strings)
  timeline: [], // { year: '', title: '', text: '' }
  values: [], // { title: '', text: '' }
  stats: [], // { value: 0, label: '', suffix: '' } - value is a real number

  // From the footer.
  email: '307915@deped.gov.ph',
  mapUrl: 'https://share.google/sRx85lq4zhIe5o27t',
  facebookUrl: 'https://www.facebook.com/DelaPazNationalHS',

  // To be provided by the school (phone left empty until confirmed).
  phone: '',
  address: '',
  officeHours: '',
};

export default aboutContent;
