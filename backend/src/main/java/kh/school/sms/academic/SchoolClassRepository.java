package kh.school.sms.academic;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolClassRepository extends JpaRepository<SchoolClass, Long> {
    boolean existsByAcademicYearIdAndGradeIdAndNameKm(Long academicYearId, Long gradeId, String nameKm);

    boolean existsByAcademicYearIdAndGradeIdAndNameKmAndIdNot(Long academicYearId, Long gradeId, String nameKm, Long id);
}
