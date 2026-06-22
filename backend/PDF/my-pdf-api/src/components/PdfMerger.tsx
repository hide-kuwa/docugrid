'use client';

import dynamic from 'next/dynamic';

const PdfMerger = dynamic(() => import('@/components/PdfMergerComponent'), { ssr: false });

export default PdfMerger;
