import type { Metadata } from 'next';
import LegalDocument from '../components/LegalDocument';
import { PRIVACY_SECTIONS } from '../legal/content';

export const metadata: Metadata = {
  title: 'Privacy Policy — FillScore',
  description: 'What FillScore collects, why, and how it is protected.',
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro="This page explains what data FillScore handles, what it is used for, and the choices you have."
      sections={PRIVACY_SECTIONS}
      otherHref="/terms"
      otherLabel="Read the Terms of Service"
    />
  );
}
