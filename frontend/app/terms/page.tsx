import type { Metadata } from 'next';
import LegalDocument from '../components/LegalDocument';
import { TERMS_SECTIONS } from '../legal/content';

export const metadata: Metadata = {
  title: 'Terms of Service — FillScore',
  description: 'The terms for using FillScore.',
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro="These terms cover your use of FillScore. Please read them before you create an account or connect an exchange."
      sections={TERMS_SECTIONS}
      otherHref="/privacy"
      otherLabel="Read the Privacy Policy"
    />
  );
}
