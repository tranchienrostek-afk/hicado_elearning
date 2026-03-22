# Resource Inventory & Management: 19_Elearning

## 1. Document Purpose
This document acts as the centralized source of truth for all assets required for the **E-Learning Tracking & Growth System**. It ensures that stakeholders, developers, and trainers have access to necessary infrastructure, materials, and human support.

## 2. Human Resources
| Role | Responsibility | Contact/Assignee |
| :--- | :--- | :--- |
| **Project Lead** | Overall project management and requirement approval. | [TBD] |
| **Course Designer** | Creating curriculum and instructional materials. | [TBD] |
| **IT Support/Dev** | Infrastructure setup and software maintenance. | [TBD] |
| **Trainers** | Delivering content and evaluating student growth. | [TBD] |

## 3. Infrastructure & Platforms
*   **Host/Server**: [TBD] (Proposed: Supabase / AWS / Azure)
*   **LMS Framework**: Compatible with `Phần mềm TT Bồi dưỡng.xlsx`.
*   **Database**: PostgreSQL for tracking persistent learner data.
*   **Source Code**: Shared repository on [GitHub/GitLab].

## 4. Digital Assets (Learning Material)
*   **Tracking Templates**: `Learning Tracking sheet - File Gốc.xlsx` (Used for automated export styling).
*   **Gamification Logic**: `Plant Growing Tracker.xlsx` (Defines growth milestones).
*   **Core Modules**: [Link to SCORM packages, PDFs, and Video Storage].
*   **Media Library**: Icons, glassmorphism UI assets, and plant growth animations.

## 5. Physical Resources
*   **Training Centers**: Locations tracked in `TT Bồi dưỡng`.
*   **Hardware**: Laptops, projection systems, and IoT sensors (if applicable for plant tracking).

## 6. Access Control & Security
*   **Credentials**: All sensitive keys must be stored in a secure `.env` file or Secret Manager.
*   **Permissions**: Role-Based Access Control (RBAC) mapping is required for admin vs learner access.
