import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ProjectAttachment } from '../models/project.models';

interface UploadProjectAttachmentResponse {
  success: boolean;
  attachment: {
    name: string;
    size: number;
    mimeType: string;
    url: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ProjectAttachmentUploadService {
  private readonly http = inject(HttpClient);

  upload(file: File, scope: 'solo' | 'team') {
    const formData = new FormData();
    formData.append('scope', scope);
    formData.append('file', file);

    return this.http.post<UploadProjectAttachmentResponse>(
      `${environment.apiUrl}/project-attachments`,
      formData,
    ).pipe(
      map(res => ({
        name: res.attachment.name,
        size: this.formatSize(res.attachment.size),
        iconClass: this.getIconClass(res.attachment.name),
        url: res.attachment.url,
        bytes: res.attachment.size,
        mimeType: res.attachment.mimeType,
      }) satisfies ProjectAttachment),
    );
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / 104857.6) / 10} MB`;
  }

  private getIconClass(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
      xls: 'fa-file-excel', xlsx: 'fa-file-excel',
      ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
      jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', gif: 'fa-file-image',
      zip: 'fa-file-archive', rar: 'fa-file-archive',
    };
    return map[ext] ?? 'fa-file';
  }
}
