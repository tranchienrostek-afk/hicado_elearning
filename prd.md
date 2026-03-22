# Product Requirements Document (PRD): E-Learning Tracking & Growth System

## 1. Project Overview
The **E-Learning Tracking & Growth System** is a modern, high-performance web application designed to streamline the management of training programs. It replaces manual Excel-based tracking with a dynamic, automated platform that not only monitors progress but also motivates learners through a unique gamification experience.

## 2. Target Audience
*   **Training Administrators**: Personnel responsible for organizing courses, managing faculty, and generating official reports.
*   **Learners (Students)**: Individuals enrolled in programs who need to track their progress and stay motivated.
*   **Trainers/Instructors**: Experts who provide content and evaluate learner performance.

## 3. Key Features

### 3.1. Course & Class Management
*   **Course Repository**: Centralized storage for course details, syllabus, and materials.
*   **Class Scheduling**: Calendar integration for tracking upcoming sessions and faculty assignments.
*   **Resource Management**: Tracking of training rooms, equipment, and digital assets.

### 3.2. Advanced Learner Tracking
*   **Attendance Tracking**: Digital check-in for physical and virtual sessions.
*   **Progress Monitoring**: Real-time percentage of course completion.
*   **Performance Analytics**: Automated grading system with visual charts for quiz and assignment results.
*   **Tracking Sheet Export**: One-click export to Excel formats (compatible with `Learning Tracking sheet - File Gốc.xlsx`).

### 3.3. Gamification: The "Learning Plant" (Unique Feature)
*   **Growth Mechanics**: Every learner is assigned a virtual "Learning Plant" upon enrollment.
*   **Activity-Based Watering**: Completing a lesson or passing a quiz "waters" the plant.
*   **Evolution levels**: The plant evolves from a sprout to a flourishing tree as the learner reaches major milestones (30%, 60%, 100% completion).
*   **Social Flourishing**: A leaderboard showing the most "vibrant" gardens in a class to encourage healthy competition.

### 3.4. Reporting & Compliance
*   **Automated Certificates**: Generate and issue verified digital certificates upon course completion.
*   **Audit logs**: Track all changes to learner records for compliance with training center standards (`Phần mềm TT Bồi dưỡng.xlsx`).

## 4. Design & Aesthetics
The application MUST feel premium and state-of-the-art:
*   **Visual Style**: Glassmorphism (frosted glass effects, subtle shadows, vibrant blurred backgrounds).
*   **Color Palette**: Harmonious gradients (e.g., Emerald Green to Deep Forest for growth themes, Slate Blue for professional sections).
*   **Typography**: Modern sans-serif (e.g., *Inter* or *Outfit*) for maximum readability.
*   **Micro-interactions**: Smooth transitions between pages and interactive components (hover effects on plant nodes, progress bar animations).

## 5. Technical Requirements (Proposed)
*   **Frontend**: Next.js (App Router) for SEO and performance.
*   **Styling**: Vanilla CSS with CSS Variables for theme management.
*   **Backend**: Supabase or Node.js with PostgreSQL.
*   **Authentication**: Secure login with Role-Based Access Control (RBAC).

## 6. Future Roadmap
*   **AI Tutoring**: Integrated AI assistant to answer learner questions based on course content.
*   **Mobile App**: Native experience for on-the-go learning tracking.
*   **Integration**: Syncing with LinkedIn Learning and Coursera APIs.

## 7. Metrics & Success Indicators (KPIs)
*   **Engagement Rate**: Frequency of "Plant Watering" actions per week.
*   **Completion Rate**: Percentage of learners who reach the "Flourishing Tree" stage (100% completion).
*   **Satisfaction Score**: Survey results integrated into the platform's profile section.
*   **Efficiency**: Time saved by administrators compared to manual Excel tracking.

## 8. Core User Flows

### 8.1. Learner Onboarding & Growth
1.  **Login**: Learner logs in and sees their "Sprout" on the dashboard.
2.  **Course Access**: Learner enters a module and completes a video/quiz.
3.  **Action**: Learner clicks "Water Plant" (or it happens automatically on completion).
4.  **Feedback**: Visual animation of the plant growing and progress bar updating.

### 8.2. Admin Reporting
1.  **Selection**: Admin selects a class and a date range.
2.  **Generation**: System compiles data into a formatted table.
3.  **Export**: Admin clicks "Export to Excel" to download a file matching existing styles.
