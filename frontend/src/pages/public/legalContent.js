// ============================================
// FILE: src/pages/public/legalContent.js
// Q2: the Terms & Conditions and the Privacy Policy, word for word from the
// school's document (TermsOFuse_privacyPolicy.docx). Do not edit the wording
// here; change the source document and copy it again.
//
// A block is a paragraph string or { list: [...] }. Inside a string,
// **text** is bold and [text](/path) is a link to another page.
// ============================================

export const LEGAL_LAST_UPDATED = 'November 23, 2026';

export const TERMS = {
  title: 'Terms & Conditions',
  intro: [
    'Welcome to **EduScribe**, an AI-assisted web-based lesson planning and learning resource management platform for Dela Paz National High School. By accessing our web platform, logging into your account, or using our services, you agree to be bound by these Terms & Conditions and our [Privacy Policy](/privacy).',
  ],
  sections: [
    {
      heading: '1. Acceptance of Terms',
      blocks: [
        'By logging in with your school-issued account, you confirm that you have read, understood, and agree to these Terms. If you do not agree, you may not access or use the web platform.',
      ],
    },
    {
      heading: '2. User Accounts & Access',
      blocks: [
        'Access to EduScribe is restricted to authorized students, teachers, and school administrators of Dela Paz National High School. You are responsible for safeguarding your login credentials and for all activity performed under your account. Notify the school administration immediately if you suspect any unauthorized access.',
      ],
    },
    {
      heading: '3. Acceptable Use',
      blocks: [
        'You agree to use the web platform strictly for legitimate academic and school-related purposes. Users must not misuse the system, including:',
        { list: [
          'Attempting to disrupt web services, bypass security controls, or access other users\' accounts and private records.',
          'Uploading malicious files, harmful code, or offensive and unauthorized content.',
          'Harassing other users or engaging in academic dishonesty (submit your own work unless explicitly permitted by your teacher).',
        ] },
      ],
    },
    {
      heading: '4. Academic Work, Grades & Records',
      blocks: [
        { list: [
          '**Portal results only:** Scores, feedback, and assessment outputs displayed on the web portal are released by teachers for monitoring and informational purposes only.',
          '**Official school records:** Official grades and permanent academic records are maintained separately by the school registrar and DepEd.',
          '**Record corrections:** Authorized administrators reserve the right to review, update, or correct inaccurate entries in the system when necessary.',
        ] },
      ],
    },
    {
      heading: '5. Uploaded Learning Materials',
      blocks: [
        'Teachers and authorized users are responsible for the modules, files, and learning resources they upload to the platform. By uploading content, you confirm that you have the necessary rights or permissions to share those materials for educational use.',
      ],
    },
    {
      heading: '6. AI-Assisted Lesson Planning & Tools',
      blocks: [
        'EduScribe provides AI-assisted tools to support lesson planning, content drafting, and learning resource management.',
        { list: [
          'AI-generated outputs are provided as instructional aids and guidance only.',
          'Teachers and users are responsible for reviewing, editing, and verifying AI-generated materials for accuracy and alignment with DepEd curriculum standards before classroom use.',
        ] },
      ],
    },
    {
      heading: '7. Data Privacy & Security',
      blocks: [
        'User information, academic outputs, and uploaded resources are processed strictly for school and educational purposes in compliance with the **Data Privacy Act of 2012 (RA 10173)** and DepEd data protection guidelines.',
      ],
    },
    {
      heading: '8. Service Availability & Limitation of Liability',
      blocks: [
        'This web-based platform is provided on an "as-is" and "as-available" basis and may experience temporary downtime for system maintenance, updates, or internet connectivity issues. To the maximum extent permitted by law, Dela Paz National High School and the system developers shall not be liable for any indirect or incidental damages arising from temporary service interruptions or unverified AI-generated outputs.',
      ],
    },
    {
      heading: '9. Account Suspension & Archiving',
      blocks: [
        'The school administration may suspend, deactivate, or archive an account if a user violates these Terms, or once a student graduates, transfers, or a faculty member concludes their service at the school.',
      ],
    },
    {
      heading: '10. Changes to These Terms',
      blocks: [
        'We may update these Terms & Conditions from time to time, with the date above reflecting the latest version. Continued use of the web portal after updates are posted constitutes acceptance of the revised Terms.',
      ],
    },
    {
      heading: '11. Contact',
      blocks: [
        'For questions, account assistance, or technical concerns regarding these Terms, contact the school administration at **307915@deped.gov.ph**.',
      ],
    },
  ],
};

export const PRIVACY = {
  title: 'Privacy Policy',
  intro: [
    'Welcome to **EduScribe**, an AI-assisted web-based lesson planning and learning resource management platform for Dela Paz National High School. We respect your privacy and are committed to protecting the personal and academic information you share with us. This Privacy Policy explains how we collect, use, and safeguard your data in compliance with the **Data Privacy Act of 2012 (RA 10173)** and DepEd data protection standards.',
  ],
  sections: [
    {
      heading: '1. Information We Collect',
      blocks: [
        'When you use our web platform, we may collect the following types of information:',
        { list: [
          '**Account & Profile Data:** Name, school-issued email address, user role (student, teacher, administrator), and authentication credentials.',
          '**Academic & Instructional Data:** Lesson plans, uploaded learning resources, modules, feedback, and assessment outputs.',
          '**System Usage Data:** Activity logs, timestamps, and interaction history with web features for system security and auditing.',
        ] },
      ],
    },
    {
      heading: '2. How We Use Your Information',
      blocks: [
        'The information collected is used strictly for legitimate educational and institutional purposes, including:',
        { list: [
          'Managing user accounts, authentication, and role-based access to the portal.',
          'Supporting AI-assisted lesson planning, content drafting, and learning resource organization.',
          'Monitoring academic progress, feedback, and classroom resource distribution.',
          'Maintaining system security, troubleshooting technical issues, and complying with administrative audits.',
        ] },
      ],
    },
    {
      heading: '3. Data Sharing & Disclosure',
      blocks: [
        'We do not sell, trade, or rent your personal information. Your data is shared only under the following circumstances:',
        { list: [
          '**Within the School:** Accessible only to authorized teachers, school administrators, and designated system developers for academic and technical oversight.',
          '**Legal Compliance:** When required by law or official directives from the Department of Education (DepEd).',
        ] },
      ],
    },
    {
      heading: '4. Data Security',
      blocks: [
        'We implement industry-standard security measures—including encrypted authentication, role-based database access controls, and secure server protocols—to protect your personal and academic information from unauthorized access, alteration, or disclosure.',
      ],
    },
    {
      heading: '5. Your Data Privacy Rights',
      blocks: [
        'In accordance with the Data Privacy Act of 2012, you have the right to:',
        { list: [
          'Access and review your personal data stored in the portal.',
          'Request the correction of inaccurate or outdated information.',
          'Inquire about the processing of your data by contacting our school administration.',
        ] },
      ],
    },
    {
      heading: '6. Changes to This Privacy Policy',
      blocks: [
        'We may update this Privacy Policy from time to time to reflect system enhancements or legal updates. The date above indicates the latest revision. Continued use of the platform after changes are posted constitutes your acceptance of the updated policy.',
      ],
    },
    {
      heading: '7. Contact Us',
      blocks: [
        'If you have questions, concerns, or requests regarding this Privacy Policy or your data, please contact us at **307915@deped.gov.ph**.',
      ],
    },
  ],
};
