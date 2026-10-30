package kh.school.sms.academic;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AcademicYearRepository extends JpaRepository<AcademicYear, Long> {
    List<AcademicYear> findAllByOrderByStartDateDesc();

    @Modifying
    @Query("update AcademicYear a set a.current = false where a.current = true")
    void clearCurrent();
}
