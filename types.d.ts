import 'react';
import { LucideProps as OriginalLucideProps } from 'lucide-react';

declare module 'react' {
  interface ReactElement {
    // Add React element properties if needed
  }
}

declare module 'lucide-react' {
  interface LucideProps extends OriginalLucideProps {
    className?: string;
  }
} 