// ============================================
// FILE: src/pages/about/aboutContent.js
// Everything the About page says, in one place. Real data only. Q2: the text
// is the school's about-content.md, as written (no tagline, no vision
// statement), and the photo captions are its captions.txt. The school name,
// map and Facebook links come from the header and footer. Every empty field is
// waiting for the school; a section of the page appears only once its field is
// filled. In a string, [text](/path) is a link to another page.
// ============================================

const PHOTO_SOURCE = 'Facebook posts of Barangay Dela Paz and Mayor Gel Alonte';

const aboutContent = {
  // From the header and the footer.
  schoolName: 'Dela Paz National High School',

  // "About EduScribe"
  portalSummary: 'EduScribe is an AI-assisted, web-based lesson planning and learning resource management platform for Dela Paz National High School.',

  // "What EduScribe does"
  features: [
    { who: 'Teachers', items: [
      'Plan lessons with a manual ILAW form or an AI-assisted draft powered by Gemini, and review and edit every draft before it is used.',
      'Create worksheets, check answers, release scores and record attendance.',
      'Share learning materials with their classes.',
    ] },
    { who: 'Students', items: [
      'See the tasks and worksheets for their own section and submit their answers.',
      'View released scores, attendance, announcements and learning materials.',
    ] },
    { who: 'Administrators', items: [
      'Create accounts by invitation and set up sections, schedules and teaching loads.',
      'Publish school news, announcements and the school calendar.',
    ] },
  ],

  // "Who can use it"
  whoCanUse: 'EduScribe is for the students, teachers and administrators of Dela Paz National High School. Accounts are created by the school through an email invitation; there is no public sign-up. Personal and academic information is handled under the Data Privacy Act of 2012 (RA 10173) and DepEd data protection guidelines. See the [Terms of Use](/terms) and the [Privacy Policy](/privacy).',

  // "From the campus", with the six photos (files in public/about/).
  campus: {
    title: 'From the campus: turnover of the new perimeter fence and landscaping',
    paragraphs: [
      'On October 26, 2026, the City Government of Biñan turned over the newly built perimeter fence and landscaping improvements of Dela Paz National High School in a ceremony at the school. The project gives learners a safer and more secure campus, a tidier and cleaner school, and a more pleasant place to learn.',
      'Present at the ceremony were Cong. Arman Dimaguila; Coun. Jedidiah Alatiit II, Chair of the Committee on Education; Coun. Titus Bautista; City Education Officer Dr. Edmil Recibe; Schools Division Superintendent Dr. Arlene S. Ricasata, CESO VI; Assistant Schools Division Superintendent Dr. Edward DJ. Garcia; City Engineer Engr. Willy Alintanahin; and Barangay Captain Gino Hernandez Guico with the Sangguniang Barangay, together with teachers, school officials and students. Thanks are given to Mayor Gel Alonte and to everyone who took part.',
    ],
    photos: [
      { src: '/about/turnover-01-crowd.jpg', width: 590, height: 443, source: PHOTO_SOURCE,
        caption: 'Officials, teachers and students gather at the Turnover Ceremony of the new perimeter fence and landscaping improvements of Dela Paz National High School, October 26, 2026.' },
      { src: '/about/turnover-02-school-entrance.jpg', width: 590, height: 393, source: PHOTO_SOURCE,
        caption: 'The ceremony stage at the entrance of Dela Paz National High School.' },
      { src: '/about/turnover-03-ribbon-cutting.jpg', width: 443, height: 590, source: PHOTO_SOURCE,
        caption: 'Ribbon cutting for the newly improved school grounds.' },
      { src: '/about/turnover-04-handover.jpg', width: 590, height: 393, source: PHOTO_SOURCE,
        caption: 'City and school officials during the turnover of the completed project to the school.' },
      { src: '/about/turnover-05-gazebo.jpg', width: 1600, height: 1066, source: PHOTO_SOURCE,
        caption: 'Guests at the new gazebo, part of the landscaping improvements.' },
      { src: '/about/turnover-06-streamers-parade.jpg', width: 1600, height: 1068, source: PHOTO_SOURCE,
        caption: 'The Dela Paz National High School community celebrates the turnover along the new campus road.' },
    ],
    credit: 'Photos and details from the Facebook posts of Barangay Dela Paz and Mayor Gel Alonte.',
  },

  // "Contact"
  contactLine: 'For questions or account help, contact the school administration at 307915@deped.gov.ph.',

  // No vision statement (about-content.md).
  vision: [],

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
