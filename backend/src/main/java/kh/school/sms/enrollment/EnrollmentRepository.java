package kh.school.sms.enrollment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {
    List<Enrollment> findByStudentIdAndStatus(Long studentId, String status);

    boolean existsByStudentIdAndAcademicYearIdAndStatus(Long studentId, Long academicYearId, String status);

    long countByClassIdAndStatus(Long classId, String status);
}
