import { ilawBrandAssets } from './ilawBrandAssets';
import { ILAW_SCHOOL_LETTERHEAD } from './ilawDocumentContent';
import './IlawTemplate.css';

// Trusted document assets stay separate; the 50/50 treatment exists only in this layout.
export default function IlawHybridHeader({ showLetterhead = true }) {
  return <header className="ilaw-template-letterhead">
    <img className="ilaw-template-deped" src={ilawBrandAssets.depedLogo} alt="Department of Education logo" />
    <div className="ilaw-template-letterhead-text">
      {showLetterhead && <>
        {ILAW_SCHOOL_LETTERHEAD.map((line, index) => <p key={line} className={index === 4 ? 'ilaw-template-school' : undefined}>{line}</p>)}
      </>}
    </div>
    <div className="ilaw-template-hybrid-mark" aria-label="School and EduScribe branding">
      <img src={ilawBrandAssets.schoolSeal} alt="Dela Paz National High School seal" />
      <img src={ilawBrandAssets.eduscribeLogo} alt="EduScribe logo" />
    </div>
  </header>;
}
