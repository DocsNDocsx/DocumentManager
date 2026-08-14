import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, map, switchMap } from 'rxjs';
import { put } from '@vercel/blob/client';
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
    if (environment.production) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      const pathname = `project-attachments/${scope}/${crypto.randomUUID()}-${safeName}`;
      const clientPayload = JSON.stringify({ scope });
      return this.http.post<{ clientToken: string }>(
        `${environment.apiUrl}/project-attachments/upload-token`,
        {
          type: 'blob.generate-client-token',
          payload: { pathname, clientPayload, multipart: true },
        },
      ).pipe(
        switchMap(response => from(put(pathname, file, {
          access: 'public',
          token: response.clientToken,
          multipart: true,
        }))),
        map(blob => this.toAttachment(file.name, file.size, file.type, blob.url)),
      );
    }

    const formData = new FormData();
    formData.append('scope', scope);
    formData.append('file', file);

    return this.http.post<UploadProjectAttachmentResponse>(
      `${environment.apiUrl}/project-attachments`,
      formData,
    ).pipe(
      map(res => this.toAttachment(
        res.attachment.name,
        res.attachment.size,
        res.attachment.mimeType,
        res.attachment.url,
      )),
    );
  }

  private toAttachment(name: string, bytes: number, mimeType: string, url: string): ProjectAttachment {
    return {
      name,
      size: this.formatSize(bytes),
      iconClass: this.getIconClass(name),
      url,
      bytes,
      mimeType,
    };
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
